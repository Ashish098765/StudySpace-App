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

if __name__ == "__main__":
    
    chapters_to_scrape = {
        "https://questions.examside.com/past-years/jee/jee-main/physics/units-and-measurements": "public/data/questions/jee_phy_units.json"
    }
    
    os.makedirs('public/data/questions', exist_ok=True)
    
    print("Booting up the Hyper-Drive Engine...")
    options = Options()
    options.add_argument("--headless=new")
    
    # --- HYPER-DRIVE MODE ---
    options.page_load_strategy = 'none' 
    
    prefs = {
        "profile.managed_default_content_settings.images": 2,
        "profile.managed_default_content_settings.stylesheets": 2,
        "profile.managed_default_content_settings.fonts": 2,
        "profile.default_content_setting_values.notifications": 2
    }
    options.add_experimental_option("prefs", prefs)
    options.add_experimental_option('excludeSwitches', ['enable-logging'])
    
    driver = webdriver.Chrome(service=Service(ChromeDriverManager().install()), options=options)
    
    try:
        for chapter_url, output_file in chapters_to_scrape.items():
            print(f"\n{'='*60}")
            print(f"STARTING: {output_file}")
            
            driver.get(chapter_url)
            
            # --- THE FIX: Wait for the <body> to exist before we try to scroll it ---
            print("Waiting for page structure to initialize...")
            WebDriverWait(driver, 10).until(EC.presence_of_element_located((By.TAG_NAME, "body")))
            time.sleep(1) # Give React exactly 1 second to mount the initial list
            
            print("Scrolling to extract all links...")
            last_height = driver.execute_script("return document.body.scrollHeight")
            while True:
                driver.execute_script("window.scrollTo(0, document.body.scrollHeight);")
                time.sleep(1.2) 
                new_height = driver.execute_script("return document.body.scrollHeight")
                if new_height == last_height:
                    break 
                last_height = new_height
            
            all_links = driver.find_elements(By.TAG_NAME, "a")
            question_links = list(set([l.get_attribute("href") for l in all_links if l.get_attribute("href") and "/past-years/jee/question/" in l.get_attribute("href")]))
            print(f"Found {len(question_links)} unique questions.\n")
            
            all_data = []
            
            for i, link in enumerate(question_links):
                try:
                    driver.get(link)
                    wait = WebDriverWait(driver, 3) 
                    
                    check_btn = wait.until(EC.presence_of_element_located((By.XPATH, "//button[contains(translate(text(), 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), 'check')]")))
                    options_buttons = wait.until(EC.presence_of_all_elements_located((By.CSS_SELECTOR, "div[role='button']")))
                    
                    driver.execute_script("arguments[0].click();", options_buttons[0])
                    driver.execute_script("arguments[0].click();", check_btn)
                    
                    wait.until(lambda d: len(d.find_elements(By.XPATH, "//h2[contains(translate(text(), 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), 'explanation')]/following-sibling::div")) > 0)
                    
                    soup = BeautifulSoup(driver.page_source, 'html.parser')
                    container = soup.find('div', class_='question-component') or soup.find('div', class_=re.compile(r'question', re.I))
                    
                    if container:
                        for annotation in container.find_all('annotation', encoding=re.compile(r'application/x-tex', re.I)):
                            raw_tex = annotation.text.strip()
                            math_wrapper = annotation.find_parent('span', class_='katex') or annotation.find_parent('math')
                            if math_wrapper:
                                math_wrapper.replace_with(f" ${raw_tex}$ ")
                                
                        for script in container.find_all('script', type=re.compile(r'math/tex', re.I)):
                            raw_tex = script.text.strip() if script.text else ""
                            if raw_tex:
                                if 'display' in script.get('type', ''):
                                    script.replace_with(f" $${raw_tex}$$ ")
                                else:
                                    script.replace_with(f" ${raw_tex}$ ")

                        for math_visual in container.find_all(class_=['MathJax_Preview', 'MathJax', 'MathJax_Display', 'katex-html']):
                            math_visual.decompose()

                        q_text = container.find('div', class_='question').text.strip()
                        
                        raw_options = container.find_all('div', role='button')
                        options_text = []
                        correct_index = 0 
                        
                        for idx, opt in enumerate(raw_options):
                            raw_text = opt.text.strip()
                            if "Correct Answer" in raw_text:
                                correct_index = idx
                                
                            clean_text = raw_text.replace("Correct Answer", "").replace("Wrong Answer", "").strip()
                            clean_text = " ".join(clean_text.split())
                            options_text.append(clean_text)
                        
                        explanation_header = container.find('h2', string=re.compile(r'Explanation', re.IGNORECASE))
                        explanation = explanation_header.find_next_sibling('div').text.strip() if explanation_header else "Not Available"
                        
                        body_text = soup.get_text(" ")
                        year = "Unknown Year"
                        exact_date = "Unknown Date"
                        shift = "Unknown Shift"
                        
                        match = re.search(r'(20[0-2]\d)\s*\(\s*(\d{1,2}(?:st|nd|rd|th)?\s+[A-Za-z]+)\s*(Shift\s*\d|Morning|Evening)\s*\)', body_text, re.IGNORECASE)
                        if match:
                            year = match.group(1)
                            clean_day = re.sub(r'(st|nd|rd|th)', '', match.group(2), flags=re.IGNORECASE).strip()
                            exact_date = f"{clean_day} {year}"
                            shift = match.group(3).title()
                        else:
                            year_match = re.search(r'\b(20[0-2]\d)\b', body_text)
                            if year_match: year = year_match.group(1)
                            
                            date_match = re.search(r'\b(\d{1,2}(?:st|nd|rd|th)?\s+[A-Za-z]{3,})\b', body_text)
                            if date_match and year != "Unknown Year":
                                clean_day = re.sub(r'(st|nd|rd|th)', '', date_match.group(1), flags=re.IGNORECASE).strip()
                                exact_date = f"{clean_day} {year}"
                            else:
                                exact_date = year
                                
                            shift_match = re.search(r'\b(Shift\s*\d|Morning|Evening)\b', body_text, re.IGNORECASE)
                            if shift_match: shift = shift_match.group(1).title()
                        
                        all_data.append({
                            "q": q_text, 
                            "options": options_text, 
                            "answer": correct_index, 
                            "explanation": explanation,
                            "date": exact_date, 
                            "year": year,
                            "shift": shift
                        })
                        
                        print(f"\rScraping Progress: [{i+1}/{len(question_links)}] completed...", end="")
                        
                except Exception as e:
                    print(f"\n[!] Skipped question {i+1} due to network timeout.")
                    continue 

            print("\nSaving to JSON...")
            with open(output_file, 'w', encoding='utf-8') as f:
                json.dump(all_data, f, indent=4, ensure_ascii=False)
            
            print(f"SUCCESS! Saved {len(all_data)} questions to {output_file}")

    finally:
        driver.quit()
        print("\nBrowser closed safely.")