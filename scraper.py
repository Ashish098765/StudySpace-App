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

# ---------------------------------------------------------
# MAIN SCRIPT
# ---------------------------------------------------------
if __name__ == "__main__":
    
    # Map the Target URL to your desired Output Filename
    chapters_to_scrape = {
        "https://questions.examside.com/past-years/jee/jee-main/physics/units-and-measurements": "public/data/questions/jee_phy_units.json"
        # You can add more chapters here later!
    }
    
    os.makedirs('public/data/questions', exist_ok=True)
    
    # --- 1. SETUP THE SINGLE SUPER-FAST BROWSER ---
    print("Booting up the Single Engine Browser...")
    options = Options()
    options.add_argument("--headless")
    options.page_load_strategy = 'eager' # Don't wait for images
    
    # Block heavy resources
    prefs = {
        "profile.managed_default_content_settings.images": 2,
        "profile.managed_default_content_settings.stylesheets": 2,
        "profile.managed_default_content_settings.fonts": 2
    }
    options.add_experimental_option("prefs", prefs)
    options.add_experimental_option('excludeSwitches', ['enable-logging'])
    
    # Open the browser just ONCE
    driver = webdriver.Chrome(service=Service(ChromeDriverManager().install()), options=options)
    driver.set_page_load_timeout(10) # 10 second kill switch
    
    try:
        # Loop through each chapter in your dictionary
        for chapter_url, output_file in chapters_to_scrape.items():
            print(f"\n{'='*60}")
            print(f"STARTING: {output_file}")
            print(f"{'='*60}")
            
            # --- PHASE 1: Find Links ---
            print("Finding question links...")
            driver.get(chapter_url)
            time.sleep(4) 
            
            all_links = driver.find_elements(By.TAG_NAME, "a")
            question_links = list(set([l.get_attribute("href") for l in all_links if l.get_attribute("href") and "/past-years/jee/question/" in l.get_attribute("href")]))
            print(f"Found {len(question_links)} unique questions.\n")
            
            # --- PHASE 2: Scrape Using the Same Browser ---
            all_data = []
            
            for i, link in enumerate(question_links):
                try:
                    driver.get(link)
                    wait = WebDriverWait(driver, 5) # Fast timeout
                    
                    # 1. Click option
                    options_buttons = wait.until(EC.presence_of_all_elements_located((By.CSS_SELECTOR, "div[role='button']")))
                    driver.execute_script("arguments[0].scrollIntoView(true);", options_buttons[0])
                    driver.execute_script("arguments[0].click();", options_buttons[0])
                    time.sleep(0.3) # Much faster sleep
                    
                    # 2. Click Check
                    check_btn = wait.until(EC.presence_of_element_located((By.XPATH, "//button[contains(translate(text(), 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), 'check')]")))
                    driver.execute_script("arguments[0].scrollIntoView(true);", check_btn)
                    driver.execute_script("arguments[0].click();", check_btn)
                    time.sleep(0.8) # Wait just long enough for explanation
                    
                    # 3. Parse HTML
                    soup = BeautifulSoup(driver.page_source, 'html.parser')
                    container = soup.find('div', class_='question-component')
                    
                    if container:
                        q_text = container.find('div', class_='question').text.strip()
                        
                        # --- CLEAN OPTIONS AND FIND ANSWER INDEX ---
                        raw_options = container.find_all('div', role='button')
                        options_text = []
                        correct_index = 0 
                        
                        for idx, opt in enumerate(raw_options):
                            raw_text = opt.text.strip()
                            if "Correct Answer" in raw_text:
                                correct_index = idx
                                
                            clean_text = raw_text.replace("Correct Answer", "").replace("Wrong Answer", "").strip()
                            clean_text = " ".join(clean_text.split()) # Fix weird spacing
                            options_text.append(clean_text)
                        
                        # Extract explanation
                        explanation_header = container.find('h2', string=re.compile(r'Explanation', re.IGNORECASE))
                        explanation = explanation_header.find_next_sibling('div').text.strip() if explanation_header else "Not Available"
                        
                        # Save Data
                        all_data.append({
                            "q": q_text, 
                            "options": options_text, 
                            "answer": correct_index, 
                            "explanation": explanation
                        })
                        
                        # Print progress on the same line so it doesn't spam your terminal
                        print(f"\rScraping Progress: [{i+1}/{len(question_links)}] completed...", end="")
                        
                except Exception as e:
                    print(f"\n[!] Skipped question {i+1} due to page load error.")
                    continue 

            # --- PHASE 3: Save Data ---
            print("\nSaving to JSON...")
            with open(output_file, 'w', encoding='utf-8') as f:
                json.dump(all_data, f, indent=4, ensure_ascii=False)
            
            print(f"SUCCESS! Saved {len(all_data)} questions to {output_file}")

    finally:
        # Close the single browser when completely finished
        driver.quit()
        print("\nBrowser closed safely.")