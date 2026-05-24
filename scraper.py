import undetected_chromedriver as uc
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.common.exceptions import TimeoutException
from bs4 import BeautifulSoup
import json
import os
import re
import time

def setup_driver():
    options = uc.ChromeOptions()
    options.add_argument("--headless=new")
    options.page_load_strategy = 'eager' 
    
    # Block heavy assets to speed up scraping
    prefs = {
        "profile.managed_default_content_settings.images": 2,
        "profile.managed_default_content_settings.stylesheets": 2,
        "profile.managed_default_content_settings.fonts": 2,
        "profile.default_content_setting_values.notifications": 2
    }
    options.add_experimental_option("prefs", prefs)
    
    # NOTE: Change version_main to match your Chrome version if necessary
    return uc.Chrome(options=options, version_main=148)

def scrape_chapter():
    chapters_to_scrape = {
        "https://questions.examside.com/past-years/jee/jee-main/physics/units-and-measurements": "public/data/questions/jee_phy_units.json"
    }
    
    os.makedirs('public/data/questions', exist_ok=True)
    print("--- BOOTING UP THE BULLETPROOF ENGINE ---")
    driver = setup_driver()
    
    try:
        for chapter_url, output_file in chapters_to_scrape.items():
            print(f"\n{'='*60}")
            print(f"STARTING: {output_file}")
            
            driver.get(chapter_url)
            
            # --- SCROLL AND EXTRACT ALL LINKS ---
            print("Scrolling to extract all links (Bypassing Lazy Load)...")
            WebDriverWait(driver, 10).until(EC.presence_of_element_located((By.TAG_NAME, "body")))
            
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
            
            # --- SCRAPE EACH QUESTION ---
            for i, link in enumerate(question_links):
                success = False
                last_error = ""
                
                for attempt in range(3): # 3 Retries to prevent Network Timeouts
                    try:
                        driver.get(link)
                        wait = WebDriverWait(driver, 6)
                        
                        # Wait for DOM
                        wait.until(EC.presence_of_element_located((By.CLASS_NAME, "question-component")))
                        time.sleep(0.5) # React listener buffer
                        
                        # Click option (if MCQ)
                        options_buttons = driver.find_elements(By.CSS_SELECTOR, "div[role='button']")
                        if len(options_buttons) > 0:
                            driver.execute_script("arguments[0].click();", options_buttons[0])
                        
                        # Click Check/Show Answer
                        buttons = driver.find_elements(By.TAG_NAME, "button")
                        for btn in buttons:
                            if "check" in btn.text.lower() or "show" in btn.text.lower():
                                driver.execute_script("arguments[0].click();", btn)
                                break
                        
                        # Wait for API Explanation
                        try:
                            WebDriverWait(driver, 4).until(
                                lambda d: "Correct Answer" in d.page_source or "Explanation" in d.page_source
                            )
                        except TimeoutException:
                            pass 
                        
                        time.sleep(0.5) # DOM render buffer
                        
                        soup = BeautifulSoup(driver.page_source, 'html.parser')
                        container = soup.find('div', class_='question-component')
                        
                        if not container:
                            raise ValueError("React Hydration Failed - container missing")

                        # ==========================================
                        # BULLETPROOF LATEX PRESERVATION
                        # ==========================================
                        for script in container.find_all('script', type=re.compile(r'math/tex', re.I)):
                            latex = script.string if script.string else ""
                            if latex:
                                wrapper = f" $${latex}$$ " if 'display' in script.get('type', '') else f" ${latex}$ "
                                script.insert_after(wrapper)
                                
                        for annotation in container.find_all('annotation', encoding=re.compile(r'application/x-tex', re.I)):
                            latex = annotation.text.strip()
                            if latex:
                                katex_wrapper = annotation.find_parent(class_='katex')
                                if katex_wrapper:
                                    katex_wrapper.insert_after(f" ${latex}$ ")
                                    
                        for mj in container.find_all(class_=['MathJax_Preview', 'MathJax', 'MathJax_Display', 'katex']):
                            mj.decompose()
                        # ==========================================

                        # Extract Q text
                        q_text = container.find('div', class_='question').text.strip() if container.find('div', class_='question') else "Question text missing"
                        
                        # Extract Options & Answer
                        raw_options = container.find_all('div', role='button')
                        options_text = []
                        correct_index = "N/A"
                        
                        if len(raw_options) > 0:
                            for idx, opt in enumerate(raw_options):
                                raw_text = opt.text.strip()
                                if "Correct Answer" in raw_text: correct_index = idx
                                clean_text = " ".join(raw_text.replace("Correct Answer", "").replace("Wrong Answer", "").strip().split())
                                if clean_text: options_text.append(clean_text)
                        else:
                            num_ans_match = re.search(r'Correct Answer\s*:?\s*(-?\d+\.?\d*)', container.text, re.IGNORECASE)
                            if num_ans_match: correct_index = num_ans_match.group(1)

                        # Safety Validation
                        if (len(raw_options) > 0 and len(options_text) < 2) or ("Correct Answer" not in container.text and "Explanation" not in container.text):
                            raise ValueError("Data incomplete")

                        # Extract Explanation
                        explanation_header = container.find('h2', string=re.compile(r'Explanation', re.IGNORECASE))
                        explanation = explanation_header.find_next_sibling('div').text.strip() if explanation_header and explanation_header.find_next_sibling('div') else "No Explanation Available"
                        
                        # Extract Meta
                        body_text = soup.get_text(" ")
                        year, exact_date, shift = "Unknown Year", "Unknown Date", "Unknown Shift"
                        
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
                        success = True
                        break 
                        
                    except Exception as e:
                        last_error = str(e).split('\n')[0]
                        time.sleep(1.5) 
                        continue 

                if not success:
                    print(f"\n[!] Skipped question {i+1} after 3 attempts. Error: {last_error}")

            # --- SAVE DATA ---
            print("\nSaving to JSON...")
            with open(output_file, 'w', encoding='utf-8') as f:
                json.dump(all_data, f, indent=4, ensure_ascii=False)
            
            print(f"SUCCESS! Saved {len(all_data)} questions to {output_file}")

    finally:
        print("\n--- CLOSING BROWSER ---")
        try:
            driver.quit()
            driver.__class__.__del__ = lambda self: None
        except Exception:
            pass
        print("--- SCRIPT FINISHED SUCCESSFULLY ---")

if __name__ == "__main__":
    scrape_chapter()