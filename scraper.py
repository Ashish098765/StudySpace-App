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
    
    prefs = {
        "profile.managed_default_content_settings.images": 2,
        "profile.managed_default_content_settings.stylesheets": 2,
        "profile.managed_default_content_settings.fonts": 2,
        "profile.default_content_setting_values.notifications": 2
    }
    options.add_experimental_option("prefs", prefs)
    
    driver = uc.Chrome(options=options, version_main=148)
    driver.__class__.__del__ = lambda self: None # Suppress WinError 6
    return driver

def scrape_single_question():
    chapters_to_scrape = {
        "https://questions.examside.com/past-years/jee/jee-main/physics/units-and-measurements": "public/data/questions/single_test.json"
    }
    
    os.makedirs('public/data/questions', exist_ok=True)
    print("--- BOOTING UP THE JAVASCRIPT MATH ENGINE v3 ---")
    driver = setup_driver()
    
    try:
        for chapter_url, output_file in chapters_to_scrape.items():
            print(f"\n{'='*60}")
            print(f"STARTING: {output_file}")
            
            driver.get(chapter_url)
            
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
            
            if len(question_links) > 0:
                print(f"Found {len(question_links)} unique questions. Testing exactly 1.\n")
                question_links = question_links[:1]
            else:
                print("No questions found.")
                continue
            
            all_data = []
            
            for i, link in enumerate(question_links):
                success = False
                last_error = ""
                
                for attempt in range(3):
                    try:
                        driver.get(link)
                        wait = WebDriverWait(driver, 6)
                        
                        wait.until(EC.presence_of_element_located((By.CLASS_NAME, "question-component")))
                        time.sleep(0.5) 
                        
                        options_buttons = driver.find_elements(By.CSS_SELECTOR, "div[role='button']")
                        if len(options_buttons) > 0:
                            driver.execute_script("arguments[0].click();", options_buttons[0])
                        
                        buttons = driver.find_elements(By.TAG_NAME, "button")
                        for btn in buttons:
                            if "check" in btn.text.lower() or "show" in btn.text.lower():
                                driver.execute_script("arguments[0].click();", btn)
                                break
                        
                        try:
                            WebDriverWait(driver, 4).until(
                                lambda d: "Correct Answer" in d.page_source or "Explanation" in d.page_source
                            )
                        except TimeoutException:
                            pass 
                        
                        time.sleep(0.5) 
                        
                        # ==========================================
                        # THE JAVASCRIPT MATH FLATTENER v3
                        # Extracts TeX from modern MathJax structures
                        # ==========================================
                        js_math_flattener = """
                        // 1. MathJax v3 (<mjx-container>)
                        document.querySelectorAll('mjx-container').forEach(mjx => {
                            let tex = '';
                            const mml = mjx.querySelector('annotation[encoding="application/x-tex"]');
                            if (mml) {
                                tex = mml.textContent || mml.innerText;
                            } else {
                                const prev = mjx.previousElementSibling;
                                if (prev && prev.tagName === 'SCRIPT' && prev.type.includes('math/tex')) {
                                    tex = prev.textContent || prev.innerText;
                                    prev.remove();
                                }
                            }
                            if (tex) {
                                const isDisplay = mjx.hasAttribute('display') && mjx.getAttribute('display') === 'true';
                                const wrapper = isDisplay ? ' $$' + tex.trim() + '$$ ' : ' $' + tex.trim() + '$ ';
                                mjx.insertAdjacentText('beforebegin', wrapper);
                            }
                            mjx.remove();
                        });

                        // 2. KaTeX (<span class="katex">)
                        document.querySelectorAll('.katex').forEach(katex => {
                            const mml = katex.querySelector('annotation[encoding="application/x-tex"]');
                            if (mml) {
                                const tex = mml.textContent || mml.innerText;
                                const isDisplay = katex.parentNode && katex.parentNode.classList.contains('katex-display');
                                const wrapper = isDisplay ? ' $$' + tex.trim() + '$$ ' : ' $' + tex.trim() + '$ ';
                                katex.insertAdjacentText('beforebegin', wrapper);
                            }
                            katex.remove();
                        });

                        // 3. MathJax v2 (<span class="MathJax">)
                        document.querySelectorAll('.MathJax').forEach(mj => {
                            const next = mj.nextElementSibling;
                            if (next && next.tagName === 'SCRIPT' && next.type.includes('math/tex')) {
                                const tex = next.textContent || next.innerText;
                                const isDisplay = next.type.includes('display');
                                const wrapper = isDisplay ? ' $$' + tex.trim() + '$$ ' : ' $' + tex.trim() + '$ ';
                                mj.insertAdjacentText('beforebegin', wrapper);
                                next.remove();
                            }
                            mj.remove();
                        });

                        // 4. Leftover raw scripts
                        document.querySelectorAll('script[type^="math/tex"]').forEach(script => {
                            const tex = script.textContent || script.innerText;
                            const isDisplay = script.type.includes('display');
                            const wrapper = isDisplay ? ' $$' + tex.trim() + '$$ ' : ' $' + tex.trim() + '$ ';
                            script.insertAdjacentText('beforebegin', wrapper);
                            script.remove();
                        });

                        // 5. Visual junk
                        document.querySelectorAll('.MathJax_Preview').forEach(el => el.remove());
                        """
                        driver.execute_script(js_math_flattener)
                        # ==========================================
                        
                        soup = BeautifulSoup(driver.page_source, 'html.parser')
                        container = soup.find('div', class_='question-component')
                        
                        if not container:
                            raise ValueError("React Hydration Failed")

                        # Extract Q Text
                        q_div = container.find('div', class_='question')
                        q_text = q_div.get_text(separator=" ", strip=True) if q_div else "Question text missing"
                        
                        raw_options = container.find_all('div', role='button')
                        options_text = []
                        correct_answers = []
                        
                        if len(raw_options) > 0:
                            for idx, opt in enumerate(raw_options):
                                raw_text = opt.get_text(separator=" ", strip=True)
                                if "Correct Answer" in raw_text: correct_answers.append(idx)
                                clean_text = " ".join(raw_text.replace("Correct Answer", "").replace("Wrong Answer", "").strip().split())
                                clean_text = re.sub(r'^([A-D])[\.\)\s]+', '', clean_text).strip()
                                if clean_text: options_text.append(clean_text)
                            
                            if len(correct_answers) == 1:
                                correct_index = correct_answers[0]
                            elif len(correct_answers) > 1:
                                correct_index = correct_answers
                            else:
                                correct_index = "N/A"
                        else:
                            num_ans_match = re.search(r'Correct Answer\s*:?\s*(-?\d+\.?\d*)', container.text, re.IGNORECASE)
                            if num_ans_match: 
                                correct_index = num_ans_match.group(1)
                            else:
                                correct_index = "N/A"

                        explanation = "No Explanation Available"
                        exp_headers = container.find_all(['h2', 'h3', 'strong', 'div'], string=re.compile(r'Explanation', re.IGNORECASE))
                        for header in exp_headers:
                            sibling = header.find_next_sibling('div')
                            if sibling:
                                explanation = sibling.get_text(separator="\n", strip=True)
                                break

                        body_text = soup.get_text(" ")
                        year, exact_date, shift = "Unknown Year", "Unknown Date", "Unknown Shift"
                        
                        match = re.search(r'(20[0-2]\d)\s*\(\s*(\d{1,2}(?:st|nd|rd|th)?\s+[A-Za-z]+)\s*(Shift\s*\d|Morning|Evening)\s*\)', body_text, re.IGNORECASE)
                        if match:
                            year = match.group(1)
                            clean_day = re.sub(r'(st|nd|rd|th)', '', match.group(2), flags=re.IGNORECASE).strip().title()
                            exact_date = f"{clean_day} {year}"
                            shift = match.group(3).title()
                        else:
                            year_match = re.search(r'\b(20[0-2]\d)\b', body_text)
                            if year_match: year = year_match.group(1)
                            
                            date_match = re.search(r'\b(\d{1,2}(?:st|nd|rd|th)?\s+[A-Za-z]{3,})\b', body_text)
                            if date_match and year != "Unknown Year":
                                clean_day = re.sub(r'(st|nd|rd|th)', '', date_match.group(1), flags=re.IGNORECASE).strip().title()
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
                        
                        print(f"\rScraping Progress: [1/1] completed...", end="")
                        success = True
                        break 
                        
                    except Exception as e:
                        last_error = str(e).split('\n')[0]
                        time.sleep(1.5) 
                        continue 

                if not success:
                    print(f"\n[!] Skipped question after 3 attempts. Error: {last_error}")

            print("\nSaving to JSON...")
            with open(output_file, 'w', encoding='utf-8') as f:
                json.dump(all_data, f, indent=4, ensure_ascii=False)
            
            print(f"SUCCESS! Saved the question to {output_file}")
            print(json.dumps(all_data, indent=4, ensure_ascii=False))

    finally:
        print("\n--- CLOSING BROWSER ---")
        try:
            driver.quit()
        except Exception:
            pass
        print("--- SCRIPT FINISHED SUCCESSFULLY ---")

if __name__ == "__main__":
    scrape_single_question()