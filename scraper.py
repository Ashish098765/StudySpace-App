from selenium import webdriver
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.chrome.options import Options
from webdriver_manager.chrome import ChromeDriverManager
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from bs4 import BeautifulSoup
import time
import json
import os
import re
import concurrent.futures 

# ---------------------------------------------------------
# FUNCTION 1: Scrape a SINGLE question 
# ---------------------------------------------------------
def scrape_question(link):
    options = Options()
    options.add_argument("--headless")
    options.page_load_strategy = 'eager' 
    
    prefs = {
        "profile.managed_default_content_settings.images": 2,
        "profile.managed_default_content_settings.stylesheets": 2
    }
    options.add_experimental_option("prefs", prefs)
    options.add_experimental_option('excludeSwitches', ['enable-logging'])
    
    driver = webdriver.Chrome(service=Service(ChromeDriverManager().install()), options=options)
    
    data = None
    try:
        driver.get(link)
        wait = WebDriverWait(driver, 8) 
        
        # 1. Click option
        options_buttons = wait.until(EC.presence_of_all_elements_located((By.CSS_SELECTOR, "div[role='button']")))
        driver.execute_script("arguments[0].scrollIntoView(true);", options_buttons[0])
        driver.execute_script("arguments[0].click();", options_buttons[0])
        time.sleep(0.5) 
        
        # 2. Click Check
        check_btn = wait.until(EC.presence_of_element_located((By.XPATH, "//button[contains(translate(text(), 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), 'check')]")))
        driver.execute_script("arguments[0].scrollIntoView(true);", check_btn)
        driver.execute_script("arguments[0].click();", check_btn)
        time.sleep(1.5) 
        
        # 3. Parse HTML
        soup = BeautifulSoup(driver.page_source, 'html.parser')
        container = soup.find('div', class_='question-component')
        
        if container:
            q_text = container.find('div', class_='question').text.strip()
            options_text = [opt.text.strip() for opt in container.find_all('div', role='button')]
            
            explanation_header = container.find('h2', string=re.compile(r'Explanation', re.IGNORECASE))
            explanation = explanation_header.find_next_sibling('div').text.strip() if explanation_header else "Not Available"
            
            data = {"q": q_text, "options": options_text, "explanation": explanation}
            
    except Exception as e:
        pass 
        
    finally:
        driver.quit() 
        
    return data

# ---------------------------------------------------------
# MAIN SCRIPT: Loop through chapters and save separately
# ---------------------------------------------------------
if __name__ == "__main__":
    
    # Map the Target URL to your desired Output Filename
    chapters_to_scrape = {
        "https://questions.examside.com/past-years/jee/jee-main/physics/motion-in-a-straight-line": "public/data/questions/kinematics_1.json",
        "https://questions.examside.com/past-years/jee/jee-main/physics/motion-in-a-plane": "public/data/questions/kinematics_2.json"
    }
    
    # Ensure the output directory exists
    os.makedirs('public/data/questions', exist_ok=True)
    
    # Setup the link-finder browser just once
    setup_options = Options()
    setup_options.add_argument("--headless")
    setup_driver = webdriver.Chrome(service=Service(ChromeDriverManager().install()), options=setup_options)
    
    for url, output_file in chapters_to_scrape.items():
        print(f"\n{'='*60}")
        print(f"STARTING: {output_file}")
        print(f"{'='*60}")
        
        # --- PHASE 1: Find Links ---
        print("Finding question links...")
        setup_driver.get(url)
        time.sleep(5) 
        
        all_links = setup_driver.find_elements(By.TAG_NAME, "a")
        question_links = list(set([l.get_attribute("href") for l in all_links if l.get_attribute("href") and "/past-years/jee/question/" in l.get_attribute("href")]))
        print(f"Found {len(question_links)} unique questions for this chapter.\n")
        
        # --- PHASE 2: Brute Force Scrape ---
        all_data = []
        with concurrent.futures.ThreadPoolExecutor(max_workers=5) as executor:
            futures = {executor.submit(scrape_question, link): link for link in question_links}
            
            completed = 0
            for future in concurrent.futures.as_completed(futures):
                completed += 1
                result = future.result()
                
                if result:
                    all_data.append(result)
                    print(f"[{completed}/{len(question_links)}] Scraped: {result['q'][:30]}...")
                else:
                    print(f"[{completed}/{len(question_links)}] Skipped due to error.")

        # --- PHASE 3: Save Data ---
        with open(output_file, 'w', encoding='utf-8') as f:
            json.dump(all_data, f, indent=4, ensure_ascii=False)
        
        print(f"\nSUCCESS! Saved {len(all_data)} questions to {output_file}")
        
    # Cleanup after all chapters are done
    setup_driver.quit()
    print(f"\n{'='*60}\nALL SCRAPING JOBS COMPLETED!\n{'='*60}")