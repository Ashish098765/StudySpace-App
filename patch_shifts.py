import undetected_chromedriver as uc
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from bs4 import BeautifulSoup
import json
import re
import time
import os

OUTPUT_FILE = "public/data/questions/jee_phy_units.json"

def setup_driver():
    options = uc.ChromeOptions()
    options.add_argument("--headless=new") 
    options.add_argument("--log-level=3")
    options.page_load_strategy = 'eager'
    driver = uc.Chrome(options=options, version_main=148) 
    driver.set_page_load_timeout(30)
    driver.__class__.__del__ = lambda self: None 
    return driver

def nuke_ads(driver):
    try:
        css = "ins.adsbygoogle, .adsbygoogle, iframe, [id^='google_ads'], [class*='ads'], .fixed-bottom, .sticky-ads, .video-ad, .modal-backdrop { display: none !important; }"
        driver.execute_script(f"var s=document.createElement('style'); s.innerHTML='{css}'; document.head.appendChild(s);")
    except: pass

def latexify(text):
    if not text: return ""
    sym_map = {'μ': r'\\mu', 'η': r'\\eta', 'λ': r'\\lambda', 'π': r'\\pi', 'θ': r'\\theta', 'α': r'\\alpha', 'β': r'\\beta', 'γ': r'\\gamma', 'Δ': r'\\Delta', '±': r'\\pm', '×': r'\\times', 'Ω': r'\\Omega', 'Φ': r'\\Phi', 'Ψ': r'\\Psi', 'Σ': r'\\Sigma', '∞': r'\\infty', '√': r'\\sqrt', '·': r'\\cdot', '∴': r'\\therefore'}
    for char, latex in sym_map.items(): text = text.replace(char, f' {latex} ')
    parts = re.split(r'(\$[^$]+\$)', text)
    processed = []
    for p in parts:
        if p.startswith('$'):
            processed.append(re.sub(r'([MLTAθI])\s*(\-?\d+)', r'\1^{\2}', p))
        else:
            p = re.sub(r'(\w)\s*\n\s*([/\-+*])\s*\n\s*(\w)', r'\1\2\3', p)
            def fd(m):
                d = re.sub(r'([MLTAθI])\s*(\-?\d+)', r'\1^{\2}', m.group(1))
                return f' $[{d.replace(" ", "")}]$ '
            p = re.sub(r'\[\s*([MLTAIθ\s\d\-\^]{1,})\s*\]', fd, p)
            processed.append(p)
    text = "".join(processed)
    text = re.sub(r'([a-z])([A-Z])', r'\1 \2', text)
    return re.sub(r'\n+', '\n', text).strip()

def normalize_text(text):
    if not text: return ""
    return text.replace('\t', ' ').replace('\u2013', '-').strip()

def scrape_perfect_question(driver, url):
    """The ultimate extraction function combining all our previous bug fixes."""
    try:
        driver.get(url)
        nuke_ads(driver)
        
        WebDriverWait(driver, 10).until(EC.presence_of_element_located((By.CSS_SELECTOR, ".question-component, .question-card")))
        
        # FIX 1: The Smart Solution Clicker (Fixes N/A Explanations)
        try:
            buttons = driver.find_elements(By.TAG_NAME, "button")
            for btn in buttons:
                b_text = btn.text.lower()
                if "check" in b_text or "show" in b_text or "answer" in b_text or "solution" in b_text:
                    driver.execute_script("arguments[0].click();", btn)
                    time.sleep(2) 
                    break
        except: pass
        
        soup = BeautifulSoup(driver.page_source, 'html.parser')
        cont = soup.find('div', class_='question-component') or soup.find('div', class_='question-card')
        if not cont: return None
        
        for g in cont.find_all(class_=['MathJax_Preview', 'katex-html']): g.decompose()
        for m in cont.find_all(['mjx-container', 'span'], class_='mathjax-latex'):
            tex = m.get('data-tex') or (m.find('math').get('alttext') if m.find('math') else "")
            m.replace_with(soup.new_string(f" ${tex.strip()}$ "))
            
        full = cont.get_text(" ", strip=True)
        q_div = cont.find('div', class_='question') or cont.find('div', class_='question-text')
        q_raw = q_div.get_text(" ", strip=True) if q_div else full.split('Options')[0]
        q_text = latexify(normalize_text(re.split(r'(JEE Main|NEET|JEE Advanced)\s+\d{4}', q_raw, flags=re.I)[0]))
        
        opts_raw = cont.find_all('div', role='button')
        q_type, options, answer = "mcq", [], "N/A"
        
        if opts_raw:
            for i, o in enumerate(opts_raw):
                if "Correct Answer" in o.get_text(): answer = i
                options.append(latexify(normalize_text(re.sub(r'^([A-D])[\.\)\s]+', '', o.get_text(" ", strip=True)).replace("Correct Answer", "").strip())))
        else:
            q_type = "integer"
            am = re.search(r'(?:Answer|Value)\s*[:\-]?\s*(\d+\.?\d*)', full, re.I)
            answer = am.group(1) if am else "N/A"
            
        exp_div = cont.find(['div', 'section'], class_=re.compile(r'explanation|solution|answer-details', re.I))
        exp_text = latexify(normalize_text(exp_div.get_text("\n", strip=True))) if exp_div else "N/A"
        
        # FIX 2 & 3: The "Safe Top Text" Extractor (Fixes Sidebar Bleed & 8th April Ghost)
        safe_top_text = re.split(r'(Options|Explanation|Solution)', full, flags=re.IGNORECASE)[0]
        
        # Universal Shift Fix
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
    except Exception as e: return None


print("🚀 BOOTING THE ULTIMATE N/A PATCHER...")

if not os.path.exists(OUTPUT_FILE):
    print(f"[!] Could not find {OUTPUT_FILE}.")
    exit()

with open(OUTPUT_FILE, 'r', encoding='utf-8') as f:
    questions = json.load(f)

# The "Data Roomba": Find any question that has "N/A" in ANY of its values
needs_patch_indices = []
for index, q in enumerate(questions):
    has_na = False
    for key, value in q.items():
        if value in ["N/A", "N/A Shift", "", None]: 
            has_na = True
        if isinstance(value, list) and any(v in ["N/A", "", None] for v in value): 
            has_na = True
    if has_na:
        needs_patch_indices.append(index)

print(f"🔍 Found {len(needs_patch_indices)} questions with missing data. Commencing patch...")

if len(needs_patch_indices) == 0:
    print("✨ Your JSON is absolutely pristine! No N/A values found anywhere.")
    exit()

driver = setup_driver()

try:
    for count, index in enumerate(needs_patch_indices):
        old_q = questions[index]
        url = old_q.get('url')
        print(f"\n[{count+1}/{len(needs_patch_indices)}] Re-scraping missing data for: {url[-15:]}...")
        
        new_data = scrape_perfect_question(driver, url)
        
        if new_data:
            questions[index] = new_data # Completely overwrite the old broken object
            print("   -> 🟢 Successfully patched!")
        else:
            print("   -> 🔴 Could not load page.")

        # Save progress every 5 questions
        if (count + 1) % 5 == 0:
            with open(OUTPUT_FILE, 'w', encoding='utf-8') as f:
                json.dump(questions, f, indent=4, ensure_ascii=False)

    print("\n💾 Final Save...")
    with open(OUTPUT_FILE, 'w', encoding='utf-8') as f:
        json.dump(questions, f, indent=4, ensure_ascii=False)
        
    print("🎉 Ultimate Patch Complete! Sync to GitHub to update your UI.")

finally:
    driver.quit()