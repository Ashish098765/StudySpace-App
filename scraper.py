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
    # options.add_argument("--headless=new") # Commented out so you can watch it if needed
    options.page_load_strategy = 'eager' 
    
    prefs = {
        "profile.managed_default_content_settings.images": 2,
        "profile.managed_default_content_settings.stylesheets": 2,
        "profile.managed_default_content_settings.fonts": 2,
        "profile.default_content_setting_values.notifications": 2
    }
    options.add_experimental_option("prefs", prefs)
    
    driver = uc.Chrome(options=options, version_main=148) # Adjust version_main to your Chrome version if needed
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
    options_buttons = driver.find_elements(By.CSS_SELECTOR, "div[role='button']")
    if len(options_buttons) > 0:
        driver.execute_script("arguments[0].click();", options_buttons[0])
        
    for btn in driver.find_elements(By.TAG_NAME, "button"):
        if "check" in btn.text.lower() or "show" in btn.text.lower():
            driver.execute_script("arguments[0].click();", btn)
            break
            
    time.sleep(2) # Give MathJax extra time to render
    
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

        # 6. HTML Superscripts & Subscripts
        for sup in container.find_all('sup'):
            txt = sup.get_text(strip=True)
            if txt: sup.replace_with(soup.new_string(f" $^{{{txt}}}$ "))
        for sub in container.find_all('sub'):
            txt = sub.get_text(strip=True)
            if txt: sub.replace_with(soup.new_string(f" $_{{{txt}}}$ "))
            
        # ===================================================================

        # 3. Extract Metadata and Clean Data
        full_text = container.get_text(" ", strip=True)
        
        # Metadata: Year
        year_match = re.search(r'\b(19\d{2}|20[0-2]\d)\b', full_text)
        year = year_match.group(1) if year_match else "N/A"

        # Metadata: Shift
        shift_match = re.search(r'(Morning|Evening|Afternoon)\s*Shift', full_text, re.IGNORECASE)
        shift = shift_match.group(1).capitalize() if shift_match else "N/A"

        # Metadata: Date
        date_match = re.search(r'\d{1,2}(?:st|nd|rd|th)?\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*', full_text, re.IGNORECASE)
        date = date_match.group(0) if date_match else "N/A"

        # Question
        q_div = container.find('div', class_='question')
        q_text = normalize_text(" ".join(q_div.get_text(separator=" ", strip=True).split())) if q_div else "Question missing"
        
        options_text = []
        correct_index = "N/A"
        
        # Options
        raw_options = container.find_all('div', role='button')
        for idx, opt in enumerate(raw_options):
            badge = opt.find(string=re.compile(r'Correct Answer', re.IGNORECASE))
            if badge: 
                correct_index = idx
                badge.extract()
            
            clean_text = normalize_text(" ".join(opt.get_text(separator=" ", strip=True).replace("Correct Answer", "").strip().split()))
            clean_text = re.sub(r'^([A-D])[\.\)\s]+', '', clean_text).strip()
            
            if not clean_text: clean_text = "Option unreadable"
            options_text.append(clean_text)

        # Explanation
        explanation = "No Explanation Available"
        exp_headers = container.find_all(['h2', 'h3', 'strong', 'div'], string=re.compile(r'Explanation', re.IGNORECASE))
        for header in exp_headers:
            sibling = header.find_next_sibling('div')
            if sibling:
                explanation = normalize_text(" ".join(sibling.get_text(separator=" ", strip=True).split()))
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