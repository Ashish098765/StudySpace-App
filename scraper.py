import undetected_chromedriver as uc
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from bs4 import BeautifulSoup
import json
import re
import time
import random

def normalize_text(text):
    if not text: return ""
    text = text.replace('\t', ' ').replace('\n', ' ').replace('\r', ' ')
    text = " ".join(text.split())
    # Standardize physics characters
    return text.replace('\u2013', '-').replace('\u2014', '-').replace('\u2212', '-').replace('\u00a0', ' ')

def setup_driver():
    options = uc.ChromeOptions()
    options.add_argument("--headless=new") 
    options.add_argument("--window-size=1920,1080")
    options.add_argument("--disable-gpu")
    options.page_load_strategy = 'eager' 
    prefs = {"profile.managed_default_content_settings.images": 2}
    options.add_experimental_option("prefs", prefs)
    driver = uc.Chrome(options=options, version_main=148) 
    driver.__class__.__del__ = lambda self: None 
    return driver

# ===================================================================
# THE DEFINITIVE LaTeX & SEMANTIC PARSER
# ===================================================================

def latexify(text):
    if not text: return ""
    
    # 0. Ultimate Symbol Map
    sym_map = {
        'μ': r'\mu ', 'η': r'\eta ', 'λ': r'\lambda ', 'π': r'\pi ', 
        'θ': r'\theta ', 'α': r'\alpha ', 'β': r'\beta ', 'γ': r'\gamma ',
        'Δ': r'\Delta ', '±': r'\pm ', '×': r'\times ', 'Ω': r'\Omega ',
        'Φ': r'\Phi ', 'Ψ': r'\Psi ', 'Σ': r'\Sigma ', '∞': r'\infty ',
        '√': r'\sqrt ', '·': r'\cdot ', '∴': r'\therefore ', 'ℓ': r'l',
        'ω': r'\omega ', 'τ': r'\tau ', 'ρ': r'\rho ', 'σ': r'\sigma ',
        'ϵ': r'\epsilon ', 'ε': r'\epsilon ', '≈': r'\approx ', '∠': r'\angle '
    }
    for char, latex in sym_map.items():
        text = text.replace(char, latex)

    # 1. SEMANTIC FORMULA BINDER (Stress, Strain, Area, etc.)
    # Identifies whole blocks that are scientific derivations
    def semantic_wrap(match):
        inner = match.group(1)
        # Tighten operators
        inner = re.sub(r'\s*([=+\-*/^])\s*', r'\1', inner)
        # Fix exponents inside
        inner = re.sub(r'(\d+)\s*(-?\d+)', r'\1^{\2}', inner)
        return f' ${inner}$ '
    
    # Match strings with alphanumeric vars and multiple operators
    text = re.sub(r'\b([a-zA-Z]{1,2}\s*[=+\-*/^]\s*[^.!?\n$]{4,})\b', semantic_wrap, text)

    # 2. NUMERICAL UNIT PROTECTOR: "0.08 cm", "10 N", "10 -4 m"
    # Prevents $ splitting between number and unit
    text = re.sub(r'\b(\d+\.?\d*)\s*(cm|mm|m|kg|s|N|Pa|J|W|C|V)\b', r'$\1\text{\2}$', text)
    text = re.sub(r'\b(10)\s*(-?\d+)\b', r'\1^{\2}', text)

    # 3. ATOMIC DIMENSION SHIELD: Capture [MLT]
    def shield_dim(match):
        inner = match.group(1)
        inner = re.sub(r'([MLTA])\s*(-?\d+)', r'\1^{\2}', inner)
        inner = re.sub(r'\s+', '', inner)
        return f' $[{inner}]$ '
    text = re.sub(r'\[\s*([MLTA\s\d\-\^]{1,})\s*\]', shield_dim, text)

    # 4. SCIENTIFIC LaTeX COMMAND WRAPPER
    text = re.sub(r'(?<!\$)\\([a-zA-Z]+)(?!\$)', r' $\\\1$ ', text)

    # 5. NUCLEAR MATH MERGER (10x Recursive for maximum healing)
    for _ in range(10):
        # Bridge across ALL physics separators and operators
        text = re.sub(r'\$\s*([=+\-*/^\[\](){},.:a-zA-Z0-9\\]+)\s*\$', r'\1', text)
        text = re.sub(r'\$\s*\$', '', text)

    # 6. INNER MATH CLEANUP & POWER NORMALIZATION
    def math_polish(match):
        m = match.group(1)
        # Fix the 10 -4 artifact
        m = re.sub(r'\b(10)\s*(-?\d+)\b', r'\1^{\2}', m)
        # Fix ML2, L2 etc.
        m = re.sub(r'([MLTA])(\d+)', r'\1^{\2}', m)
        m = re.sub(r'([MLTA])-(\d+)', r'\1^{-\2}', m)
        # Tighten operators
        m = re.sub(r'\s*([=+\-*/])\s*', r'\1', m)
        return f'${m.strip()}$'
    text = re.sub(r'\$([^$]+)\$', math_polish, text)

    # 7. FINAL REFINEMENTS
    # Decimal Heal: "0 . 08" -> "0.08"
    text = re.sub(r'(\d)\s*\$\s*\.\s*(\d)', r'\1.\2', text)
    text = text.replace('ext{', r'\text{')
    # Ensure one space around every isolated $ block
    text = re.sub(r'([a-zA-Z0-9])(\$)', r'\1 \2', text)
    text = re.sub(r'(\$)([a-zA-Z0-9])', r'\1 \2', text)
    
    return " ".join(text.split()).strip()

# ===================================================================

print("--- BOOTING EXAMSIDE FINAL PRO ENGINE ---")
driver = setup_driver()

try:
    chapter_url = "https://questions.examside.com/past-years/jee/jee-main/physics/units-and-measurements"
    print("Fetching dynamic link from chapter...")
    driver.get(chapter_url)
    WebDriverWait(driver, 10).until(EC.presence_of_element_located((By.TAG_NAME, "body")))
    
    all_links = driver.find_elements(By.TAG_NAME, "a")
    valid_links = [l.get_attribute("href") for l in all_links if l.get_attribute("href") and "/past-years/jee/question/" in l.get_attribute("href")]
    if not valid_links: exit()

    test_link = random.choice(valid_links)
    print(f"Testing Question URL: {test_link}\n")
    driver.get(test_link)
    WebDriverWait(driver, 10).until(EC.presence_of_element_located((By.CLASS_NAME, "question-component")))
    
    # Reveal Logic
    try:
        opt_btns = driver.find_elements(By.CSS_SELECTOR, "div[role='button']")
        if opt_btns: driver.execute_script("arguments[0].click();", opt_btns[0])
        for btn in driver.find_elements(By.TAG_NAME, "button"):
            if any(x in btn.text.lower() for x in ["check", "show", "answer"]):
                driver.execute_script("arguments[0].click();", btn)
                break
        WebDriverWait(driver, 5).until(lambda d: len(d.find_elements(By.XPATH, "//*[contains(text(), 'Explanation')]")) > 0)
    except: pass
            
    time.sleep(3) 
    soup = BeautifulSoup(driver.page_source, 'html.parser')
    container = soup.find('div', class_='question-component')
    
    if container:
        # Pre-Extraction Math Preservation
        for garbage in container.find_all(class_=['MathJax_Preview', 'katex-html', 'mjx-assistive-mml']): garbage.decompose()
        for mjx in container.find_all('mjx-container'):
            latex = mjx.get('data-tex') or (mjx.find('math').get('alttext') if mjx.find('math') else None)
            if latex: mjx.replace_with(soup.new_string(f" ${latex.strip()}$ "))
        for script in container.find_all('script', type=re.compile(r'math/tex', re.I)):
            script.replace_with(soup.new_string(f" ${script.string.strip()}$ "))
        for sup in container.find_all('sup'): sup.replace_with(soup.new_string(f"$^{{{sup.get_text(strip=True)}}}$"))
        for sub in container.find_all('sub'): sub.replace_with(soup.new_string(f"$_{{{sub.get_text(strip=True)}}}$"))

        # DATA EXTRACTION
        full_text = container.get_text(" ", strip=True)
        year = (re.search(r'\b(20[0-2]\d)\b', full_text) or re.search(r'', '')).group(0) or "N/A"
        shift = (re.search(r'(Morning|Evening|Afternoon)\s*Shift', full_text, re.I) or re.search(r'', '')).group(1) or "N/A"
        date = (re.search(r'\d{1,2}(?:st|nd|rd|th)?\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*', full_text, re.I) or re.search(r'', '')).group(0) or "N/A"

        q_div = container.find('div', class_='question')
        q_raw = q_div.get_text(separator=" ", strip=True) if q_div else "N/A"
        q_clean = re.split(r'(JEE Main|NEET|JEE Advanced)\s+\d{4}', q_raw, flags=re.I)[0]
        q_text = latexify(normalize_text(q_clean))
        
        raw_options = container.find_all('div', role='button')
        if not raw_options: raw_options = container.find_all('div', class_=re.compile(r'option|choice', re.I))
        
        q_type, options, answer = "mcq", [], "N/A"
        if raw_options:
            correct_indices = []
            for idx, opt in enumerate(raw_options):
                badge = opt.find(string=re.compile(r'Correct Answer', re.I))
                if badge: 
                    correct_indices.append(idx)
                    badge.extract()
                opt_txt = re.sub(r'^([A-D])[\.\)\s]+', '', opt.get_text(separator=" ", strip=True)).strip()
                options.append(latexify(normalize_text(opt_txt)))
            if len(correct_indices) > 1: q_type, answer = "multi_select", correct_indices
            elif len(correct_indices) == 1: answer = correct_indices[0]
        else:
            q_type = "integer"
            ans_match = re.search(r'(?:Answer|Value)\s*[:\-]?\s*(\d+\.?\d*)', full_text, re.I)
            if ans_match: answer = ans_match.group(1)

        explanation = "N/A"
        exp_header = container.find(['h2', 'h3', 'strong'], string=re.compile(r'Explanation', re.I))
        if exp_header:
            sib = exp_header.find_next_sibling('div') or exp_header.parent.find_next_sibling('div')
            if sib: explanation = latexify(normalize_text(sib.get_text(separator=" ", strip=True)))

        result = {"q": q_text, "type": q_type, "options": options, "answer": answer, "explanation": explanation, "year": year, "date": date, "shift": shift}
        print("--- EXTRACTED DATA ---")
        print(json.dumps(result, indent=4, ensure_ascii=False))

except Exception as e: print(f"[!] Error: {e}")
finally: driver.quit()
