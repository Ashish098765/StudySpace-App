import undetected_chromedriver as uc
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from bs4 import BeautifulSoup
import json
import re
import time
import os
import sys
import random

# Disable annoying system logs
os.environ['WDM_LOG_LEVEL'] = '0'

# CONFIG
CHAPTER_URL = "https://questions.examside.com/past-years/jee/jee-main/physics/units-and-measurements"
OUTPUT_FILE = "public/data/questions/jee_phy_units.json"
MAX_QUESTIONS = 230

# Ensure the output directory exists before we start
os.makedirs(os.path.dirname(OUTPUT_FILE), exist_ok=True)

def normalize_text(text):
    """
    Cleans up basic text formatting issues without trying to parse LaTeX.
    """
    if not text: return ""
    return text.replace('\t', ' ').replace('\r', ' ').replace('\u2013', '-').replace('\u2014', '-').replace('\u2212', '-').replace('\u00a0', ' ').strip()

def setup_driver():
    options = uc.ChromeOptions()
    options.add_argument("--headless=new") 
    options.add_argument("--window-size=1920,1080")
    options.add_argument("--disable-gpu")
    options.add_argument("--no-sandbox")
    options.add_argument("--disable-dev-shm-usage")
    options.add_argument("--log-level=3")
    options.add_argument("--disable-blink-features=AutomationControlled")
    options.add_argument("--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
    options.page_load_strategy = 'eager'
    
    # Instantiate Chrome (Forcing version 148 to match your machine)
    driver = uc.Chrome(options=options, version_main=148) 
    driver.set_page_load_timeout(30)
    driver.__class__.__del__ = lambda self: None # Fixes the Windows OSError [WinError 6]
    return driver

def nuke_ads(driver):
    """Aggressive background ad removal."""
    try:
        css = "ins.adsbygoogle, .adsbygoogle, iframe, [id^='google_ads'], [class*='ads'], .fixed-bottom, .sticky-ads, .video-ad, [id*='vignette'], [class*='vignette'], .modal-backdrop { display: none !important; visibility: hidden !important; height: 0 !important; width: 0 !important; pointer-events: none !important; }"
        driver.execute_script(f"var s=document.createElement('style'); s.innerHTML='{css}'; document.head.appendChild(s);")
        driver.execute_script("document.querySelectorAll('iframe').forEach(i => i.remove());")
    except: pass

def scrape_question(driver, url):
    try:
        driver.get(url)
        nuke_ads(driver)
        if any(x in driver.title.lower() for x in ["just a moment", "access denied"]) or "cf-challenge" in driver.page_source:
            return "BLOCK"
        
        WebDriverWait(driver, 15).until(EC.presence_of_element_located((By.CSS_SELECTOR, ".question-component, .question-card, .question-container, #question-card")))
        
        # SMART BUTTON CLICKER
        try:
            buttons = driver.find_elements(By.TAG_NAME, "button")
            for btn in buttons:
                b_text = btn.text.lower()
                if "check" in b_text or "show" in b_text or "answer" in b_text or "solution" in b_text:
                    driver.execute_script("arguments[0].click();", btn)
                    time.sleep(2) # Give the solution 2 full seconds to drop down!
                    break
        except: pass
        
        soup = BeautifulSoup(driver.page_source, 'html.parser')
        cont = soup.find('div', class_='question-component') or soup.find('div', class_='question-card') or soup.find('div', id='question-card') or soup.find('div', class_='question-container')
        if not cont: return "ERROR"
        
        # --- PURE LATEX EXTRACTOR ---
        # 1. Destroy visual MathJax rendering blocks (we don't want the raw text versions of equations)
        for g in cont.find_all(class_=['MathJax_Preview', 'katex-html', 'mjx-assistive-mml']): 
            g.decompose()
            
        # 2. Extract raw LaTeX from newer MathJax/KaTeX span elements
        for m in cont.find_all(['mjx-container', 'span'], class_='mathjax-latex'):
            tex = m.get('data-tex') or (m.find('math').get('alttext') if m.find('math') else "")
            if tex:
                # Add spaces around it so it doesn't merge with adjacent words, but keep the $ tight to the code
                m.replace_with(soup.new_string(f" ${tex.strip()}$ "))
                
        # 3. Extract raw LaTeX directly from hidden MathJax scripts
        for s in cont.find_all('script', type=re.compile(r'math/tex', re.I)): 
            if s.string:
                s.replace_with(soup.new_string(f" ${s.string.strip()}$ "))
                
        # 4. Standardize standard HTML superscripts/subscripts
        for s in cont.find_all('sup'): 
            s.replace_with(soup.new_string(f"^{{{s.get_text(strip=True)}}}"))
        for s in cont.find_all('sub'): 
            s.replace_with(soup.new_string(f"_{{{s.get_text(strip=True)}}}"))
        # ----------------------------
            
        full = cont.get_text(" ", strip=True)
        q_div = cont.find('div', class_='question') or cont.find('div', class_='question-text')
        q_raw = q_div.get_text(separator=" ", strip=True) if q_div else cont.get_text(separator=" ", strip=True).split('Options')[0]
        
        # Notice we only use normalize_text now, NO latexify!
        q_text = normalize_text(re.split(r'(JEE Main|NEET|JEE Advanced)\s+\d{4}', q_raw, flags=re.I)[0])
        
        opts_raw = cont.find_all('div', role='button') or cont.find_all('div', class_=re.compile(r'option|choice', re.I)) or cont.find_all('li', class_=re.compile(r'option', re.I))
        q_type, options, answer = "mcq", [], "N/A"
        
        if opts_raw:
            c_idx = []
            for i, o in enumerate(opts_raw):
                if "Correct Answer" in o.get_text() or "correct" in o.get('class', []): c_idx.append(i)
                options.append(normalize_text(re.sub(r'^([A-D])[\.\)\s]+', '', o.get_text(separator=" ", strip=True)).replace("Correct Answer", "").strip()))
            if len(c_idx) > 1: q_type, answer = "multi_select", c_idx
            elif len(c_idx) == 1: answer = c_idx[0]
        else:
            q_type = "integer"
            am = re.search(r'(?:Answer|Value)\s*[:\-]?\s*(\d+\.?\d*)', full, re.I)
            answer = am.group(1) if am else "N/A"
            
        exp_div = cont.find(['div', 'section'], class_=re.compile(r'explanation|solution|answer-details', re.I))
        if not exp_div:
            eh = cont.find(['h2', 'h3', 'strong'], string=re.compile(r'Explanation|Solution', re.I))
            if eh: exp_div = eh.find_next_sibling('div') or eh.parent.find_next_sibling('div')
        exp_text = normalize_text(exp_div.get_text(separator="\n", strip=True)) if exp_div else "N/A"
        
        # --- SAFE METADATA EXTRACTOR ---
        safe_top_text = re.split(r'(Options|Explanation|Solution)', full, flags=re.IGNORECASE)[0]
        
        raw_shift_match = re.search(r'(Morning|Evening|Afternoon|Shift\s*1|Shift\s*2|Shift\s*I\b|Shift\s*II\b)', safe_top_text, re.I)
        final_shift = "N/A"
        if raw_shift_match:
            val = raw_shift_match.group(1).lower()
            if any(w in val for w in ['morning', '1', 'i']): final_shift = "Morning"
            elif any(w in val for w in ['evening', 'afternoon', '2', 'ii']): final_shift = "Evening"
            else: final_shift = raw_shift_match.group(1)

        date_match = re.search(r'\b(\d{1,2}(?:st|nd|rd|th)?\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*)\b', safe_top_text, re.I)
        year_match = re.search(r'\b(20[0-2]\d)\b', safe_top_text)
        
        return {
            "q": q_text, 
            "type": q_type, 
            "options": options, 
            "answer": answer, 
            "explanation": exp_text, 
            "url": url,
            "year": year_match.group(1) if year_match else "N/A",
            "shift": final_shift,
            "date": date_match.group(1) if date_match else "N/A"
        }
    except Exception as e: 
        return f"TIMEOUT: {str(e)}"

def show_progress(current, total, prefix='', suffix='', length=30):
    total = max(total, 1)
    percent = f"{100 * (current / float(total)):.1f}"
    filled_length = int(length * current // total)
    bar = '█' * filled_length + '░' * (length - filled_length)
    sys.stdout.write(f'\r{prefix} |{bar}| {percent}% ({current}/{total}) {suffix}')
    sys.stdout.flush()

# RUN
print("\n🚀 EXAMSIDE SPEED-SCRAPER (PURE LATEX MODE)")
driver = setup_driver()
try:
    print(f"🔍 Discovery: {CHAPTER_URL}")
    driver.get(CHAPTER_URL)
    nuke_ads(driver)
    lc, sc, links = 0, 0, []
    
    while True:
        links = sorted(list(set([l.get_attribute("href") for l in driver.find_elements(By.TAG_NAME, "a") if l.get_attribute("href") and "/past-years/jee/question/" in l.get_attribute("href")])))
        show_progress(min(len(links), MAX_QUESTIONS), MAX_QUESTIONS, prefix='Discovery ', suffix='links found...')
        
        if len(links) >= MAX_QUESTIONS or (len(links) == lc and lc > 50 and sc >= 5): 
            break
            
        sc = sc + 1 if len(links) == lc else 0
        lc = len(links)
        
        for _ in range(4):
            driver.execute_script("window.scrollBy(0, 800);")
            time.sleep(0.5)
            
        try:
            load_more = driver.find_elements(By.XPATH, "//button[contains(translate(., 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), 'load more') or contains(translate(., 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), 'next')]")
            if load_more:
                driver.execute_script("arguments[0].click();", load_more[0])
        except: pass
            
        time.sleep(2)
    
    print("\n\n📦 Extracting (Starting from zero to overwrite JSON)...")
    results = [] # Always start empty to ensure a full overwrite
    total_links = len(links)
    
    for i, u in enumerate(links):
        show_progress(len(results), total_links, prefix='Extraction', suffix=f'Scraping...{u[-15:]}')
        
        data = scrape_question(driver, u)
        
        if data == "BLOCK":
            print("\n[!] Block detected. Re-starting driver in 45s...")
            driver.quit()
            time.sleep(45)
            driver = setup_driver()
            continue
            
        if isinstance(data, dict):
            results.append(data)
            # Save every 5 questions so you don't lose data if it crashes!
            if len(results) % 5 == 0:
                with open(OUTPUT_FILE, 'w', encoding='utf-8') as f: json.dump(results, f, indent=4, ensure_ascii=False)
                
        time.sleep(random.uniform(1.5, 3.0))

    # Final save
    with open(OUTPUT_FILE, 'w', encoding='utf-8') as f: 
        json.dump(results, f, indent=4, ensure_ascii=False)
        
    show_progress(len(results), total_links, prefix='Extraction', suffix='Complete!          ')
    print(f"\n\n🎉 Done! Saved {len(results)} questions to {OUTPUT_FILE}\n")

finally:
    try: driver.quit()
    except: pass