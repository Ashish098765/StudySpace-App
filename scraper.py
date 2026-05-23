from selenium import webdriver
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.chrome.options import Options
from webdriver_manager.chrome import ChromeDriverManager
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from bs4 import BeautifulSoup
import json
import os
import re
import time

def normalize_text(text):
    return text.replace('\u2013', '-').replace('\u2014', '-').replace('\u2212', '-')

print("--- INITIALIZING ULTIMATE FAST-HEADLESS SCRAPER ---")

# Setup output directory
output_dir = "public/data/questions"
output_file = f"{output_dir}/jee_phy_units.json"
os.makedirs(output_dir, exist_ok=True)

try:
    options = Options()
    # 1. HEADLESS & STEALTH MODE
    options.add_argument("--headless=new")
    options.add_argument("--window-size=1920,1080")
    options.add_argument("user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36")
    options.add_argument('--disable-blink-features=AutomationControlled')
    options.add_experimental_option("excludeSwitches", ["enable-automation"])
    options.add_experimental_option('useAutomationExtension', False)
    
    # 2. SPEED OPTIMIZATIONS (Block assets to save bandwidth/time)
    options.page_load_strategy = 'eager'
    prefs = {
        "profile.managed_default_content_settings.images": 2,
        "profile.default_content_setting_values.notifications": 2,
        "profile.managed_default_content_settings.stylesheets": 2
    }
    options.add_experimental_option("prefs", prefs)
    
    driver = webdriver.Chrome(service=Service(ChromeDriverManager().install()), options=options)
    
    chapter_url = "https://questions.examside.com/past-years/jee/jee-main/physics/units-and-measurements"
    print(f"Navigating to chapter page: {chapter_url}")
    driver.get(chapter_url)
    
    WebDriverWait(driver, 15).until(EC.presence_of_element_located((By.TAG_NAME, "body")))
    
    print("Scrolling to load all questions...")
    last_height = driver.execute_script("return document.body.scrollHeight")
    while True:
        driver.execute_script("window.scrollTo(0, document.body.scrollHeight);")
        time.sleep(1.5)
        new_height = driver.execute_script("return document.body.scrollHeight")
        if new_height == last_height:
            break
        last_height = new_height
        
    all_links = driver.find_elements(By.TAG_NAME, "a")
    valid_links = list(set([l.get_attribute("href") for l in all_links if l.get_attribute("href") and "/past-years/jee/question/" in l.get_attribute("href")]))
    
    print(f"\n[+] Successfully found {len(valid_links)} questions to scrape!")
    
    all_data = []
    
    for i, link in enumerate(valid_links):
        try:
            driver.get(link)
            
            # TIME-BOUND: Wait max 10s for the question to exist
            WebDriverWait(driver, 10).until(
                lambda d: len(d.find_elements(By.CLASS_NAME, "question")) > 0 and 
                          len(d.find_element(By.CLASS_NAME, "question").text.strip()) > 0
            )
            
            # Reveal explanation
            for btn in driver.find_elements(By.TAG_NAME, "button"):
                if any(x in btn.text.lower() for x in ["check", "show", "answer"]):
                    driver.execute_script("arguments[0].click();", btn)
                    break
                    
            # TIME-BOUND: Wait max 4s for explanation to render (prevents Answer: 0 bug)
            try:
                WebDriverWait(driver, 4).until(
                    EC.presence_of_element_located((By.XPATH, "//h2[contains(translate(text(), 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), 'explanation')]"))
                )
            except:
                pass # If no explanation exists, just keep moving
                
            soup = BeautifulSoup(driver.page_source, 'html.parser')
            container = soup.find('div', class_='question-component')
            
            if not container:
                continue

            # Math Extraction (Flawless logic)
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
                
            # Metadata Extraction
            full_text = container.get_text(" ", strip=True)
            year_match = re.search(r'\b(19\d{2}|20[0-2]\d)\b', full_text)
            year = year_match.group(1) if year_match else "Unknown"

            shift_match = re.search(r'(Morning|Evening|Afternoon)\s*Shift', full_text, re.IGNORECASE)
            shift = shift_match.group(1).capitalize() if shift_match else "Unknown"

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

            all_data.append({
                "q": q_text,
                "options": options_text,
                "answer": correct_index,
                "explanation": explanation,
                "year": year,
                "date": date,
                "shift": shift
            })
            
            print(f"\r[>] Scraping Progress: {i+1}/{len(valid_links)} completed...", end="", flush=True)
            
        except Exception as e:
            error_msg = str(e).split('\n')[0][:40]
            print(f"\n[!] Skipped Q{i+1}: {error_msg}")

    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(all_data, f, indent=4, ensure_ascii=False)
        
    print(f"\n\n[+] DONE! Scraped {len(all_data)} questions perfectly and saved to {output_file}")

except Exception as e:
    print(f"\n[!] FATAL ERROR: {e}")

finally:
    try:
        driver.quit()
    except:
        pass