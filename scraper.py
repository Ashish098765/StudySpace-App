import undetected_chromedriver as uc
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.common.exceptions import TimeoutException
from bs4 import BeautifulSoup
import json
import re
import time
import random

def normalize_text(text):
    if not text: return ""
    return text.replace('\u2013', '-').replace('\u2014', '-').replace('\u2212', '-').replace('\u00a0', ' ')

def setup_driver():
    options = uc.ChromeOptions()
    options.add_argument("--headless=new") # Headless mode enabled
    options.page_load_strategy = 'eager' 
    
    prefs = {
        "profile.managed_default_content_settings.images": 2,
        "profile.managed_default_content_settings.stylesheets": 2,
        "profile.managed_default_content_settings.fonts": 2,
        "profile.default_content_setting_values.notifications": 2
    }
    options.add_experimental_option("prefs", prefs)
    
    driver = uc.Chrome(options=options, version_main=148) 
    driver.__class__.__del__ = lambda self: None 
    return driver

print("--- BOOTING 1-QUESTION TEST ENGINE ---")
driver = setup_driver()

try:
    # 1. Grab a valid link dynamically
    chapter_url = "https://questions.examside.com/past-years/jee/jee-main/physics/units-and-measurements"
    print("Fetching dynamic link from chapter...")
    driver.get(chapter_url)
    
    WebDriverWait(driver, 10).until(EC.presence_of_element_located((By.TAG_NAME, "body")))
    
    all_links = driver.find_elements(By.TAG_NAME, "a")
    valid_links = [l.get_attribute("href") for l in all_links if l.get_attribute("href") and "/past-years/jee/question/" in l.get_attribute("href")]
    
    if not valid_links:
        print("[!] No valid question links found on the page.")
        driver.quit()
        exit()

    test_link = random.choice(valid_links)
    print(f"Testing Question URL: {test_link}\n")
    
    # 2. Navigate to the question
    driver.get(test_link)
    wait = WebDriverWait(driver, 10)
    wait.until(EC.presence_of_element_located((By.CLASS_NAME, "question-component")))
    time.sleep(1) # Let React hydrate
    
    # Reveal options/answers
    try:
        # 1. Click the first option to ensure "Check Answer" or "Show Answer" appears
        options_buttons = driver.find_elements(By.CSS_SELECTOR, "div[role='button']")
        if len(options_buttons) > 0:
            driver.execute_script("arguments[0].click();", options_buttons[0])
            time.sleep(0.5)
            
        # 2. Find and click "Check Answer" or "Show Answer"
        found_btn = False
        for btn in driver.find_elements(By.TAG_NAME, "button"):
            btn_text = btn.text.lower()
            if any(x in btn_text for x in ["check", "show", "answer"]):
                driver.execute_script("arguments[0].click();", btn)
                found_btn = True
                print(f"Clicked button: {btn.text}")
                break
        
        if not found_btn:
            # Try a broader selector if no button was found by text
            btns = driver.find_elements(By.CSS_SELECTOR, ".question-component button")
            if btns:
                driver.execute_script("arguments[0].click();", btns[-1])
                print("Clicked last button in component as fallback")

        # 3. Wait for explanation to actually render in the DOM
        WebDriverWait(driver, 5).until(
            lambda d: len(d.find_elements(By.XPATH, "//*[contains(text(), 'Explanation')]")) > 0 or
                      len(d.find_elements(By.CLASS_NAME, "explanation")) > 0
        )
    except Exception as e:
        print(f"Note: Could not explicitly trigger answer revelation: {e}")
            
    time.sleep(3) # Extra time for MathJax and dynamic text
    
    soup = BeautifulSoup(driver.page_source, 'html.parser')
    container = soup.find('div', class_='question-component')
    
    if container:
        # ===================================================================
        # THE FIX: SURGICAL MATH & IMAGE REPLACEMENT
        # ===================================================================
        
        # 1. Cleanup Garbage (Hidden elements that cause duplication)
        for garbage in container.find_all(class_=['MathJax_Preview', 'katex-html', 'mjx-assistive-mml']):
            garbage.decompose()

        # 2. Handle MathJax 3 (mjx-container)
        for mjx in container.find_all('mjx-container'):
            latex = mjx.get('data-tex')
            if not latex:
                math_tag = mjx.find('math')
                if math_tag: latex = math_tag.get('alttext')
            
            # Fallback to assistive MML text if available (sometimes contains TeX)
            if not latex:
                assist = mjx.find(class_='mjx-assistive-mml')
                if assist: latex = assist.get_text(strip=True)

            if latex:
                mjx.replace_with(soup.new_string(f" ${latex.strip()}$ "))

        # 3. Handle MathJax 2 (script math/tex)
        for script in container.find_all('script', type=re.compile(r'math/tex', re.I)):
            latex = script.string or script.get_text()
            if latex:
                script.replace_with(soup.new_string(f" ${latex.strip()}$ "))
                
        # 4. Handle KaTeX (annotation)
        for katex in container.find_all(class_='katex'):
            ann = katex.find('annotation')
            latex = ann.get_text(strip=True) if ann else None
            if latex:
                katex.replace_with(soup.new_string(f" ${latex}$ "))

        # 5. Handle Images (The most common fail point)
        for img in container.find_all('img'):
            latex = img.get('data-tex') or img.get('alt')
            # Filter out generic UI alt texts like "Question Image"
            if latex and not any(x in latex.lower() for x in ["image", "logo", "icon", "loading"]) or len(latex or "") > 30:
                clean_latex = (latex or "").replace('$', '').strip()
                img.replace_with(soup.new_string(f" ${clean_latex}$ "))
            else:
                img.decompose()

        # 6. HTML Superscripts & Subscripts (Tighter integration)
        for sup in container.find_all('sup'):
            txt = sup.get_text(strip=True)
            if txt: sup.replace_with(soup.new_string(f"$^{{{txt}}}$"))
        for sub in container.find_all('sub'):
            txt = sub.get_text(strip=True)
            if txt: sub.replace_with(soup.new_string(f"$_{{{txt}}}$"))
            
        # ===================================================================

        # 3. Extract Metadata and Clean Data
        def latexify_plain_text(text):
            if not text: return ""
            
            # 0. High-Priority Symbol Map
            sym_map = {
                'μ': r'\mu ', 'η': r'\eta ', 'λ': r'\lambda ', 'π': r'\pi ', 
                'θ': r'\theta ', 'α': r'\alpha ', 'β': r'\beta ', 'γ': r'\gamma ',
                'Δ': r'\Delta ', '±': r'\pm ', '×': r'\times ', 'Ω': r'\Omega ',
                'Φ': r'\Phi ', 'Ψ': r'\Psi ', 'Σ': r'\Sigma ', '∞': r'\infty ',
                '√': r'\sqrt '
            }
            for char, latex in sym_map.items():
                text = text.replace(char, latex)
            
            # A. Convert Units: "kg m -1 s -1" -> "$\text{kg m}^{-1}\text{s}^{-1}$"
            unit_pattern = r'\b(kg|m|s|A|K|mol|cd|N|Pa|J|W|C|V|F|T|H|Wb)\s+(-?\d+)\b'
            text = re.sub(unit_pattern, r' \\text{\1}^{\2} ', text)

            # B. Detect Fractions/Roots in plain text: "1 2" -> "1/2" or "sqrt l" -> "\sqrt{l}"
            text = re.sub(r'\bsqrt\s+([a-zA-Z0-9]+)', r'\\sqrt{\1}', text, flags=re.I)
            # Handle common physics fraction "1 2" -> "1/2"
            text = re.sub(r'\b1\s+2\b', r'1/2', text)
            
            # C. Fix plain-text powers: ONLY for single letters (excluding Roman Numerals)
            text = re.sub(r'\b([a-df-hj-uw-z])\s+(-?\d+)\b', r'\1^{\2}', text)
            
            # D. Wrap dimensions: "[M L T]" -> "$[M L T]$"
            text = re.sub(r'(?<!\$)(\[[^\]]{2,}\])(?!\$)', r' $\1$ ', text)
            
            # E. Wrap potential equations: "v = At^2"
            text = re.sub(r'(?<!\$)\b([a-zA-Z]\s*=[^.!?\n$]+)(?!\$)', r' $\1$ ', text)
            
            # F. Wrap standalone variables (excluding Roman Numerals and common articles)
            text = re.sub(r'(?<![\$\w])([v-zBCDE-NP-RT-Z])(?![\$\w])', r' $\1$ ', text)
            
            return text

        def clean_math_spacing(text):
            if not text: return ""
            text = text.replace('&', r'\&')
            
            # 1. Formatting "Match List" or structure
            text = re.sub(r'\b(List\s*-\s*II|List\s*II)\b', r'\n\1', text)
            text = re.sub(r'(\([a-d]\))', r'\n\1', text)
            text = re.sub(r'(\(i{1,3}|iv\))', r'\n\1', text)
            
            # 2. Prevent $ from breaking numbers/decimals (e.g., "0$.1$" -> "$0.1$")
            text = re.sub(r'(\d)\s*\$\s*\.\s*(\d)', r'\1.\2', text)
            
            # 3. Ensure closing brace inside $ if we created a power
            text = re.sub(r'(\$\b[^$]+\^\{\d+)(?!\})', r'\1}', text)
            
            # 4. Spacing cleanup for LaTeX blocks
            text = re.sub(r'\s+(\$)', r'\1', text)
            text = re.sub(r'(\$)\s+', r'\1', text)
            text = re.sub(r'\$\s*\$', '', text)
            
            # 5. Fix \text artifact and unit merging
            text = text.replace('} \\text{', r'} \cdot \text{')
            # Final safety for \text escaping
            text = text.replace('ext{', r'\text{')
            
            return text.strip()

        full_text = container.get_text(" ", strip=True)
        
        # Metadata Extraction
        year_match = re.search(r'\b(19\d{2}|20[0-2]\d)\b', full_text)
        year = year_match.group(1) if year_match else "N/A"
        shift_match = re.search(r'(Morning|Evening|Afternoon)\s*Shift', full_text, re.IGNORECASE)
        shift = shift_match.group(1).capitalize() if shift_match else "N/A"
        date_match = re.search(r'\d{1,2}(?:st|nd|rd|th)?\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*', full_text, re.IGNORECASE)
        date = date_match.group(0) if date_match else "N/A"

        # Question text
        q_div = container.find('div', class_='question')
        q_text_raw = q_div.get_text(separator=" ", strip=True) if q_div else ""
        q_text_raw = re.split(r'(JEE Main|NEET|JEE Advanced)\s+\d{4}', q_text_raw, flags=re.IGNORECASE)[0]
        
        q_text = clean_math_spacing(latexify_plain_text(normalize_text(q_text_raw)))
        
        options_text = []
        correct_index = "N/A"
        
        # Options
        raw_options = container.find_all('div', role='button')
        if not raw_options:
            raw_options = container.find_all('div', class_=re.compile(r'option|choice', re.I))
            
        for idx, opt in enumerate(raw_options):
            badge = opt.find(string=re.compile(r'Correct Answer', re.IGNORECASE))
            if badge: 
                correct_index = idx
                badge.extract()
            
            # STRIP LABEL BEFORE PROCESSING: Remove "A. ", "(A) ", etc.
            opt_raw = opt.get_text(separator=" ", strip=True).replace("Correct Answer", "").strip()
            opt_raw = re.sub(r'^([A-D])[\.\)\s]+', '', opt_raw).strip()
            
            clean_text = clean_math_spacing(latexify_plain_text(normalize_text(opt_raw)))
            if clean_text: options_text.append(clean_text)

        if not options_text:
             options_text = ["Options could not be detected"]

        # Explanation
        explanation = "No Explanation Available"
        exp_headers = container.find_all(['h2', 'h3', 'strong', 'div'], string=re.compile(r'Explanation', re.IGNORECASE))
        for header in exp_headers:
            sibling = header.find_next_sibling('div')
            if not sibling: sibling = header.parent.find_next_sibling('div')
            
            if sibling:
                exp_raw = sibling.get_text(separator=" ", strip=True)
                exp_raw = re.sub(r'([a-z]\.)([A-Z])', r'\1 \2', exp_raw) 
                explanation = clean_math_spacing(latexify_plain_text(normalize_text(exp_raw)))
                break

        # Result structure
        result = {
            "q": q_text,
            "options": options_text,
            "answer": correct_index,
            "explanation": explanation,
            "year": year,
            "date": date,
            "shift": shift
        }

        print("--- EXTRACTED DATA ---")
        print(json.dumps(result, indent=4, ensure_ascii=False))

    else:
        print("[!] Could not find question container.")

except Exception as e:
    print(f"[!] Error: {e}")

finally:
    driver.quit()