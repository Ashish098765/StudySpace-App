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
    options.add_argument("--headless=new")
    options.add_argument("--window-size=1920,1080")
    options.page_load_strategy = 'eager'
    prefs = {
        "profile.managed_default_content_settings.images": 2,
        "profile.default_content_setting_values.notifications": 2,
        "profile.managed_default_content_settings.stylesheets": 2
    }
    options.add_experimental_option("prefs", prefs)
    
    options.add_argument("user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36")
    options.add_argument('--disable-blink-features=AutomationControlled')
    options.add_experimental_option("excludeSwitches", ["enable-automation"])
    options.add_experimental_option('useAutomationExtension', False)
    
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
            
            WebDriverWait(driver, 10).until(
                lambda d: len(d.find_elements(By.CLASS_NAME, "question")) > 0 and 
                          len(d.find_element(By.CLASS_NAME, "question").text.strip()) > 0
            )
            
            for btn in driver.find_elements(By.TAG_NAME, "button"):
                if any(x in btn.text.lower() for x in ["check", "show", "answer"]):
                    driver.execute_script("arguments[0].click();", btn)
                    break
                    
            try:
                WebDriverWait(driver, 4).until(
                    EC.presence_of_element_located((By.XPATH, "//h2[contains(translate(text(), 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), 'explanation')]"))
                )
            except:
                pass 
                
            time.sleep(0.3) 

            # =======================================================
            # THE FIX: BROWSER-SIDE MATHJAX DE-RENDERER
            # Extracts pure LaTeX code directly from MathJax's memory
            # =======================================================
            driver.execute_script("""
                // MathJax v3
                document.querySelectorAll('mjx-container').forEach(el => {
                    try {
                        let tex = '';
                        if (el.MathJax && el.MathJax.math && el.MathJax.math.math) {
                            tex = el.MathJax.math.math;
                        } else if (el.querySelector('math') && el.querySelector('math').getAttribute('alttext')) {
                            tex = el.querySelector('math').getAttribute('alttext');
                        } else if (el.getAttribute('data-tex')) {
                            tex = el.getAttribute('data-tex');
                        }
                        
                        if (tex) {
                            let textNode = document.createTextNode(' $' + tex.trim() + '$ ');
                            el.parentNode.replaceChild(textNode, el);
                        }
                    } catch(e) {}
                });
                
                // MathJax v2
                document.querySelectorAll('script[type^="math/tex"]').forEach(el => {
                    try {
                        let tex = el.innerText;
                        let textNode = document.createTextNode(' $' + tex.trim() + '$ ');
                        let next = el.nextElementSibling;
                        if (next && next.classList.contains('MathJax_Preview')) next.remove();
                        next = el.nextElementSibling;
                        if (next && next.classList.contains('MathJax')) next.remove();
                        el.parentNode.replaceChild(textNode, el);
                    } catch(e) {}
                });
            """)
            # =======================================================
                
            soup = BeautifulSoup(driver.page_source, 'html.parser')
            container = soup.find('div', class_='question-component')
            
            if not container:
                continue

            # Fallback wrapper for raw HTML superscripts/subscripts
            for sup in container.find_all('sup'):
                sup.replace_with(soup.new_string(f"$^{{{sup.get_text(strip=True)}}}$"))
            for sub in container.find_all('sub'):
                sub.replace_with(soup.new_string(f"$_{{{sub.get_text(strip=True)}}}$"))
                
            q_div = container.find('div', class_='question')
            q_text = normalize_text(q_div.get_text(" ", strip=True)) if q_div else ""
            
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
                
            exp_header = container.find('h2', string=re.compile(r'Explanation', re.IGNORECASE))
            explanation = normalize_text(exp_header.find_next_sibling('div').get_text(" ", strip=True)) if exp_header and exp_header.find_next_sibling('div') else "No Explanation"

            page_title = driver.title
            page_url = driver.current_url
            
            year_match = re.search(r'\b(19\d{2}|20[0-2]\d)\b', page_title)
            if not year_match:
                year_match = re.search(r'\b(19\d{2}|20[0-2]\d)\b', page_url)
            year = year_match.group(1) if year_match else "Unknown"

            shift_match = re.search(r'(Morning|Evening|Afternoon)', page_title, re.IGNORECASE)
            shift = shift_match.group(1).capitalize() if shift_match else "Unknown"

            date_match = re.search(r'\d{1,2}(?:st|nd|rd|th)?\s+(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)', page_title, re.IGNORECASE)
            date = date_match.group(0) if date_match else "Unknown"

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

    print("\n\n[+] Scraping complete. Sorting questions chronologically...")
    
    all_data.sort(key=lambda x: int(x["year"]) if x["year"].isdigit() else 0, reverse=True)

    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(all_data, f, indent=4, ensure_ascii=False)
        
    print(f"[+] DONE! Saved {len(all_data)} perfectly formatted questions to {output_file}")

except Exception as e:
    print(f"\n[!] FATAL ERROR: {e}")

finally:
    try:
        driver.quit()
    except:
        pass