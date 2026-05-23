from selenium import webdriver
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.chrome.options import Options
from webdriver_manager.chrome import ChromeDriverManager
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from bs4 import BeautifulSoup
import json
import re
import time

def normalize_text(text):
    return text.replace('\u2013', '-').replace('\u2014', '-').replace('\u2212', '-')

print("--- STARTING METADATA TEST ---")

try:
    options = Options()
    options.add_argument("--window-size=1920,1080")
    options.add_argument("user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36")
    options.add_experimental_option("excludeSwitches", ["enable-automation"])
    options.add_experimental_option('useAutomationExtension', False)
    
    driver = webdriver.Chrome(service=Service(ChromeDriverManager().install()), options=options)
    
    chapter_url = "https://questions.examside.com/past-years/jee/jee-main/physics/units-and-measurements"
    print("Navigating to chapter page...")
    driver.get(chapter_url)
    
    WebDriverWait(driver, 15).until(EC.presence_of_element_located((By.TAG_NAME, "body")))
    
    all_links = driver.find_elements(By.TAG_NAME, "a")
    valid_links = [l.get_attribute("href") for l in all_links if l.get_attribute("href") and "/past-years/jee/question/" in l.get_attribute("href")]
    
    test_link = valid_links[0]
    print(f"\n[+] Navigating to live question:\n{test_link}")
    driver.get(test_link)
    
    # Wait for question text to load
    WebDriverWait(driver, 10).until(
        lambda d: len(d.find_elements(By.CLASS_NAME, "question")) > 0 and 
                  len(d.find_element(By.CLASS_NAME, "question").text.strip()) > 0
    )
    time.sleep(1)
    
    print("Clicking 'Show Answer'...")
    for btn in driver.find_elements(By.TAG_NAME, "button"):
        if any(x in btn.text.lower() for x in ["check", "show", "answer"]):
            driver.execute_script("arguments[0].click();", btn)
            break
            
    print("Waiting for explanation to render...")
    try:
        WebDriverWait(driver, 5).until(
            EC.presence_of_element_located((By.XPATH, "//h2[contains(translate(text(), 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), 'explanation')]"))
        )
    except:
        pass
        
    time.sleep(0.5) 
    
    soup = BeautifulSoup(driver.page_source, 'html.parser')
    container = soup.find('div', class_='question-component')
    
    if container:
        # Math Extraction
        for math_el in container.find_all(['mjx-container', 'script', 'span', 'img']):
            latex = None
            if math_el.name == 'script' and 'math/tex' in math_el.get('type', ''):
                latex = math_el.get_text(strip=True)
            elif math_el.name == 'mjx-container':
                math_tag = math_el.find('math')
                if math_tag and math_tag.has_attr('alttext'):
                    latex = math_tag['alttext']
                else:
                    latex = math_el.get_text(strip=True)
            elif 'katex' in math_el.get('class', []):
                ann = math_el.find('annotation')
                if ann:
                    latex = ann.get_text(strip=True)
                else:
                    latex = math_el.get_text(strip=True)
            elif math_el.name == 'img' and math_el.has_attr('alt'):
                if '\\' in math_el['alt'] or '^' in math_el['alt']:
                    latex = math_el['alt']
            
            if latex is not None:
                math_el.replace_with(soup.new_string(f" ${latex}$ "))

        for sup in container.find_all('sup'):
            sup.replace_with(soup.new_string(f"^{sup.get_text(strip=True)}"))
        for sub in container.find_all('sub'):
            sub.replace_with(soup.new_string(f"_{sub.get_text(strip=True)}"))
            
        # Get raw text for metadata extraction
        full_text = container.get_text(" ", strip=True)

        # Meta: Year
        year_match = re.search(r'\b(19\d{2}|20[0-2]\d)\b', full_text)
        year = year_match.group(1) if year_match else "Unknown"

        # Meta: Shift
        shift_match = re.search(r'(Morning|Evening|Afternoon)\s*Shift', full_text, re.IGNORECASE)
        shift = shift_match.group(1).capitalize() if shift_match else "Unknown"

        # Meta: Date
        date_match = re.search(r'\d{1,2}(?:st|nd|rd|th)?\s+(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)', full_text, re.IGNORECASE)
        date = date_match.group(0) if date_match else "Unknown"
            
        # Question
        q_div = container.find('div', class_='question')
        q_text = normalize_text(q_div.get_text(" ", strip=True)) if q_div else ""
        
        # Options and Answer Index
        options_text = []
        correct_index = 0
        for idx, opt in enumerate(container.find_all('div', role='button')):
            badge = opt.find(string=re.compile(r'Correct Answer', re.IGNORECASE))
            if badge:
                correct_index = idx
                badge.extract()
                
            clean_opt = normalize_text(opt.get_text(" ", strip=True).strip())
            if len(clean_opt) > 1 and clean_opt[1] == " ":
                 clean_opt = f"{clean_opt[0]}. {clean_opt[2:].strip()}"
            elif len(clean_opt) > 0 and clean_opt[0] in ["A", "B", "C", "D"] and not clean_opt.startswith(("A.", "B.", "C.", "D.")):
                 clean_opt = f"{clean_opt[0]}. {clean_opt[1:].strip()}"
            options_text.append(clean_opt)
            
        # Explanation
        exp_header = container.find('h2', string=re.compile(r'Explanation', re.IGNORECASE))
        explanation = normalize_text(exp_header.find_next_sibling('div').get_text(" ", strip=True)) if exp_header and exp_header.find_next_sibling('div') else "No Explanation"

        # FINAL JSON ASSEMBLY
        result = {
            "q": q_text,
            "options": options_text,
            "answer": correct_index,
            "explanation": explanation,
            "year": year,
            "date": date,
            "shift": shift
        }
        
        print("\n--- FINAL JSON RESULT ---")
        print(json.dumps(result, indent=4, ensure_ascii=False))

    else:
        print("[!] Failed to find question container.")

except Exception as e:
    print(f"\n[!] ERROR: {e}")

finally:
    try:
        driver.quit()
    except:
        pass