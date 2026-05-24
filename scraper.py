import undetected_chromedriver as uc
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.common.exceptions import TimeoutException
from bs4 import BeautifulSoup
import json
import re
import time

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
    
    test_link = valid_links[2] # Picking the 3rd link just to be safe
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
            
    time.sleep(1) 
    
    soup = BeautifulSoup(driver.page_source, 'html.parser')
    container = soup.find('div', class_='question-component')
    
    if container:
        # ===================================================================
        # THE FIX: SURGICAL MATH & IMAGE REPLACEMENT
        # Convert all visual math into pure text $strings$ before extracting
        # ===================================================================
        
        # A. Handle Images (Often used for older equations and options)
        for img in container.find_all('img'):
            latex = img.get('data-tex') or img.get('alt')
            if latex and any(c in latex for char in ['\\', '^', '_', '=', 'frac'] for c in char):
                img.replace_with(soup.new_string(f" ${latex.strip()}$ "))
            else:
                img.decompose() # Remove useless UI images

        # B. Handle MathJax 3 (Modern ExamSide)
        for mjx in container.find_all('mjx-container'):
            latex = mjx.get('data-tex')
            if not latex:
                math_tag = mjx.find('math')
                if math_tag: latex = math_tag.get('alttext')
            if not latex:
                latex = mjx.get_text(strip=True)
                
            if latex: mjx.replace_with(soup.new_string(f" ${latex.strip()}$ "))

        # C. Handle MathJax 2 & KaTeX Scripts
        for script in container.find_all('script', type=re.compile(r'math/tex', re.I)):
            latex = script.string
            if latex:
                target = script.parent if script.parent and 'MathJax' in script.parent.get('class', []) else script
                target.replace_with(soup.new_string(f" ${latex.strip()}$ "))
                
        for katex in container.find_all(class_='katex'):
            ann = katex.find('annotation')
            latex = ann.text if ann else katex.get_text(strip=True)
            katex.replace_with(soup.new_string(f" ${latex.strip()}$ "))

        # D. Sweep leftovers
        for garbage in container.find_all(class_=['MathJax_Preview', 'katex-html']):
            garbage.decompose()

        # E. HTML Superscripts & Subscripts (Crucial for $x^p$ or Dimensions $ML^2$)
        for sup in container.find_all('sup'):
            sup.replace_with(soup.new_string(f"$^{{{sup.get_text(strip=True)}}}$"))
        for sub in container.find_all('sub'):
            sub.replace_with(soup.new_string(f"$_{{{sub.get_text(strip=True)}}}$"))
            
        # ===================================================================

        # 3. Extract perfectly clean data
        q_div = container.find('div', class_='question')
        q_text = " ".join(q_div.get_text(separator=" ", strip=True).split()) if q_div else "Question missing"
        
        options_text = []
        correct_index = "N/A"
        
        # Check options
        raw_options = container.find_all('div', role='button')
        if len(raw_options) > 0:
            for idx, opt in enumerate(raw_options):
                # Isolate correct badge
                badge = opt.find(string=re.compile(r'Correct Answer', re.IGNORECASE))
                if badge: 
                    correct_index = idx
                    badge.extract()
                
                # Because we replaced images/mjx above, get_text() will now perfectly catch the math!
                clean_text = " ".join(opt.get_text(separator=" ", strip=True).replace("Correct Answer", "").strip().split())
                clean_text = re.sub(r'^([A-D])[\.\)\s]+', '', clean_text).strip()
                
                if not clean_text: clean_text = "Option was unreadable empty image"
                options_text.append(clean_text)

        # Explanation
        explanation = "No Explanation Available"
        exp_headers = container.find_all(['h2', 'h3', 'strong', 'div'], string=re.compile(r'Explanation', re.IGNORECASE))
        for header in exp_headers:
            sibling = header.find_next_sibling('div')
            if sibling:
                explanation = " ".join(sibling.get_text(separator=" ", strip=True).split())
                break

        # Result structure
        result = {
            "q": q_text,
            "options": options_text,
            "answer": correct_index,
            "explanation": explanation
        }

        print("--- EXTRACTED DATA ---")
        print(json.dumps(result, indent=4, ensure_ascii=False))

    else:
        print("[!] Could not find question container.")

except Exception as e:
    print(f"[!] Error: {e}")

finally:
    driver.quit()