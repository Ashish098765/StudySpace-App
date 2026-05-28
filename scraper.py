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

# Disable annoying system logs
os.environ['WDM_LOG_LEVEL'] = '0'

# CONFIG
CHAPTER_URL = "https://questions.examside.com/past-years/jee/jee-main/physics/units-and-measurements"
OUTPUT_FILE = "public/data/questions/jee_phy_units.json"
MAX_QUESTIONS = 230

# Toggle this! False = You watch it work. True = Runs invisibly in the background.
HEADLESS_MODE = False 

# Ensure the output directory exists before we start
os.makedirs(os.path.dirname(OUTPUT_FILE), exist_ok=True)

def normalize_text(text):
    """Cleans up basic text formatting issues, spacing, and excessive newlines."""
    if not text: return ""
    text = text.replace('\t', ' ').replace('\r', '').replace('\u2013', '-').replace('\u2014', '-').replace('\u2212', '-').replace('\u00a0', ' ')
    text = re.sub(r'\n{2,}', '\n', text)
    text = re.sub(r' {2,}', ' ', text)
    text = re.sub(r' \n', '\n', text)
    text = re.sub(r'\n ', '\n', text)
    return text.strip()

def setup_driver():
    options = uc.ChromeOptions()
    
    if HEADLESS_MODE:
        options.add_argument("--headless=new") 
        
    options.add_argument("--window-size=1920,1080")
    options.add_argument("--log-level=3")
    options.page_load_strategy = 'eager'
    
    driver = uc.Chrome(options=options, version_main=148) 
    driver.set_page_load_timeout(20) 
    driver.__class__.__del__ = lambda self: None 
    return driver

def nuke_ads(driver):
    try:
        css = "ins.adsbygoogle, .adsbygoogle, iframe, [id^='google_ads'], [class*='ads'], .fixed-bottom, .sticky-ads, .video-ad, [id*='vignette'], [class*='vignette'], .modal-backdrop { display: none !important; }"
        driver.execute_script(f"var s=document.createElement('style'); s.innerHTML='{css}'; document.head.appendChild(s);")
    except: pass

def scrape_question(driver, url):
    try:
        driver.get(url)
        nuke_ads(driver)
        if "cf-challenge" in driver.page_source or "just a moment" in driver.title.lower():
            return "BLOCK"
        
        # Fast wait
        WebDriverWait(driver, 5).until(EC.presence_of_element_located((By.CSS_SELECTOR, ".question-component, .question-card, .question-container, #question-card")))
        
        # SMART BUTTON CLICKER 
        try:
            buttons = driver.find_elements(By.TAG_NAME, "button")
            for btn in buttons:
                b_text = btn.text.lower()
                if "check" in b_text or "show" in b_text or "answer" in b_text or "solution" in b_text:
                    driver.execute_script("arguments[0].click();", btn)
                    time.sleep(0.3) 
                    break
        except: pass
        
        # FIXED: Switched back to html.parser to prevent instant crashes on Windows!
        soup = BeautifulSoup(driver.page_source, 'html.parser') 
        
        cont = soup.find('div', class_='question-component') or soup.find('div', class_='question-card') or soup.find('div', id='question-card') or soup.find('div', class_='question-container')
        if not cont: return "ERROR: Question container not found."
        
        # --- PURE LATEX EXTRACTOR ---
        for g in cont.find_all(class_=['MathJax_Preview', 'katex-html', 'mjx-assistive-mml']): g.decompose()
            
        for m in cont.find_all(['mjx-container', 'span'], class_='mathjax-latex'):
            tex = m.get('data-tex') or (m.find('math').get('alttext') if m.find('math') else "")
            if tex: m.replace_with(soup.new_string(f" ${tex.strip()}$ "))
                
        for s in cont.find_all('script', type=re.compile(r'math/tex', re.I)): 
            if s.string: s.replace_with(soup.new_string(f" ${s.string.strip()}$ "))
                
        for s in cont.find_all('sup'): s.replace_with(soup.new_string(f"^{{{s.get_text(strip=True)}}}"))
        for s in cont.find_all('sub'): s.replace_with(soup.new_string(f"_{{{s.get_text(strip=True)}}}"))
        # ----------------------------
            
        full = cont.get_text(" ", strip=True)
        q_div = cont.find('div', class_='question') or cont.find('div', class_='question-text')
        q_raw = q_div.get_text(separator=" ", strip=True) if q_div else cont.get_text(separator=" ", strip=True).split('Options')[0]
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
        return f"CRASH: {str(e)}"

def show_progress(current, total, prefix='', suffix='', length=30):
    total = max(total, 1)
    percent = f"{100 * (current / float(total)):.1f}"
    filled_length = int(length * current // total)
    bar = '█' * filled_length + '░' * (length - filled_length)
    # Adding spaces at the end clears out any leftover text from longer strings
    sys.stdout.write(f'\r{prefix} |{bar}| {percent}% ({current}/{total}) {suffix}          ')
    sys.stdout.flush()

# RUN
print("\n🚀 EXAMSIDE SPEED-SCRAPER (LOCAL MODE)")
driver = setup_driver()
try:
    print(f"🔍 Discovery: {CHAPTER_URL}")
    driver.get(CHAPTER_URL)
    nuke_ads(driver)
    lc, sc, links = 0, 0, []
    
    while True:
        raw_links = [l.get_attribute("href") for l in driver.find_elements(By.TAG_NAME, "a") if l.get_attribute("href") and "/past-years/jee/question/" in l.get_attribute("href")]
        links = list(dict.fromkeys(raw_links))
        
        show_progress(min(len(links), MAX_QUESTIONS), MAX_QUESTIONS, prefix='Discovery ', suffix='links found...')
        
        if len(links) >= MAX_QUESTIONS or (len(links) == lc and lc > 50 and sc >= 3): 
            break
            
        sc = sc + 1 if len(links) == lc else 0
        lc = len(links)
        
        driver.execute_script("window.scrollTo(0, document.body.scrollHeight);")
        time.sleep(0.5)
            
        try:
            load_more = driver.find_elements(By.XPATH, "//button[contains(translate(., 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), 'load more') or contains(translate(., 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), 'next')]")
            if load_more:
                driver.execute_script("arguments[0].click();", load_more[0])
        except: pass
            
        time.sleep(1)
    
    print("\n\n📦 Extracting...")
    results = []
    total_links = len(links)
    
    for i, u in enumerate(links):
        # FIXED: Now tracks loop iteration (i+1) instead of len(results) so the bar actually moves!
        show_progress(i + 1, total_links, prefix='Extraction', suffix=f'Scraping...{u[-10:]}')
        
        data = scrape_question(driver, u)
        
        if data == "BLOCK":
            print(f"\n[!] Block detected on link {i+1}. Cooldown for 15s...")
            driver.quit()
            time.sleep(15)
            driver = setup_driver()
            continue
            
        elif isinstance(data, dict):
            results.append(data)
            if len(results) % 5 == 0:
                with open(OUTPUT_FILE, 'w', encoding='utf-8') as f: json.dump(results, f, indent=4, ensure_ascii=False)
        else:
            # FIXED: Prints the exact error reason if a question fails, instead of failing silently.
            print(f"\n[!] Failed to scrape question {i+1}: {data}")
                
        time.sleep(0.2) 

    # Final save
    with open(OUTPUT_FILE, 'w', encoding='utf-8') as f: 
        json.dump(results, f, indent=4, ensure_ascii=False)
        
    show_progress(total_links, total_links, prefix='Extraction', suffix='Complete!          ')
    print(f"\n\n🎉 Done! Successfully saved {len(results)} out of {total_links} questions to {OUTPUT_FILE}\n")

finally:
    try: driver.quit()
    except: pass