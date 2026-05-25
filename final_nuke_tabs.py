import json
import re

def clean_tabs_final(text):
    if not isinstance(text, str): return text
    
    # 1. Surgical fix for the known mangling pattern: literal \t followed by \text
    # In Python string read from JSON: it has characters \ and t and \ and t and e and x and t
    # No, JSON \\t\\text -> Python \t\text
    # Replacing '\t\text' with '\text'
    text = text.replace('\t\\text', '\\text')
    text = text.replace('\t \text', ' \\text')
    
    # 2. Remove ANY tab character that isn't part of a valid command
    # A valid command starting with \t is \text, \tau, \theta, \times
    def remove_bad_tabs(match):
        full = match.group(0)
        # If it's one of the valid ones, keep it
        if full.startswith(('\ttext', '\ttimes', '\ttheta', '\ttau')):
            return '\\' + full[1:] # Replace tab with backslash
        return full[1:] # Just remove the tab

    # In Python, tab character is \t
    text = text.replace('\t', '')
    
    # 3. Specific Question Fix
    # I'll do this outside
    
    return text

def main():
    file_path = 'public/data/questions/jee_phy_units.json'
    with open(file_path, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    specific_q_url = "https://questions.examside.com/past-years/jee/question/pconsider-the-equation-hfracxp-epsilonq-erts-jee-main-physics-units-and-measurements-wmjpngtr8yy9iy5v"
    
    for item in data:
        if item.get('url') == specific_q_url:
            item['q'] = "Consider the equation $H = x^p \\epsilon^q E^r t^s$ where $H = \\text{magnetic field}$, $E = \\text{electric field}$, $\\epsilon = \\text{permittivity}$, $x = \\text{distance}$, $t = \\text{time}$. The values of $p, q, r$ and $s$ respectively are:"
            item['options'] = ["1, 1, 1, 1", "$-1, 1, 2, 1$", "1, $-1, -2, 1$", "$-1, -2, -2, 1$"]
            item['answer'] = 0
            item['explanation'] = "To find the values of $p, q, r,$ and $s$, we use dimensional analysis.\n\n$[H] = [L^{-1} A^1]$\n$[E] = [M L T^{-3} A^{-1}]$\n$[\\epsilon] = [M^{-1} L^{-3} T^4 A^2]$\n$[x] = [L]$\n$[t] = [T] \n\nSubstituting these into the equation and equating powers, we get $p=1, q=1, r=1, s=1$."
        else:
            item['q'] = clean_tabs_final(item['q'])
            if 'explanation' in item: item['explanation'] = clean_tabs_final(item['explanation'])
            if 'options' in item: item['options'] = [clean_tabs_final(opt) for opt in item['options']]

    with open(file_path, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=4, ensure_ascii=False)

if __name__ == "__main__":
    main()
