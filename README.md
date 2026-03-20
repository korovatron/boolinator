# Boolinator

A free A-Level Boolean algebra simplification practice tool for students revising Computer Science.

## About

Boolinator generates random Boolean logic challenges and grades your simplified expressions based on:
- **Logical equivalence** — your answer must match the truth table
- **Gate count reduction** — simplify to the minimum possible 2-input gates
- **Notation support** — AQA, logic symbols, or programming notation

## Features

- **Multiple notation styles**: AQA (overbar, apostrophe), logic symbols (∧, ∨, ¬), or programming (!&|)
- **Smart parsing**: Supports implicit AND, superscript primes, LaTeX input, and copy-paste from challenges
- **Real-time feedback**: Equivalence checking, gate counting, and hints
- **Exam-style questions**: Diverse generator with realistic simplification depths
- **No setup required**: Static HTML/JS web app—open in any browser with Live Server or GitHub Pages

## Getting Started

### Local Development

1. Clone the repository:
   ```bash
   git clone https://github.com/korovatron/boolinator
   cd boolinator
   ```

2. Open `index.html` with **Live Server** (VS Code extension) or any local web server.

3. Or serve with Python:
   ```bash
   python -m http.server 8000
   ```

4. Visit http://localhost:8000

### GitHub Pages

Push to the `main` branch and enable GitHub Pages in repository settings for automatic hosting at `https://korovatron.github.io/boolinator`.

## Technologies

- **MathLive** — interactive math input fields and rendering
- **Math.js** — expression evaluation for equivalence checking
- **Vanilla JavaScript** — no build tools or npm required

## How It Works

1. A random challenge expression is generated with a known gate count
2. You enter a simplified equivalent expression in AQA, logic, or code notation
3. Press **Check expression** to verify:
   - Is it logically equivalent? (truth table match)
   - How many gates does it use? (compared to challenge and minimal)
4. Keep refining until you reach the minimal gate count and solve the challenge
5. Generate a new challenge anytime

## File Structure

```
boolinator/
├── index.html              # Main entry point
├── src/
│   ├── main.js            # UI and interaction logic
│   ├── booleanEngine.js   # Parser, evaluator, generator, gate counter
│   └── style.css          # Styling (dark theme)
├── README.md              # This file
├── LICENSE                # GNU GPL v3
└── .gitignore             # Git configuration
```

## License

GNU General Public License v3.0 (GPL-3.0) — see [LICENSE](LICENSE) for details.

## Contributing

Found a bug or have an idea? Feel free to open an issue or submit a pull request.

## For Exam Boards

Boolinator supports notation from major exam boards:
- **AQA**: Overbar (‾), apostrophe ('), superscript prime (ᴘ)
- **OCR/Edexcel**: Logic symbols (∧, ∨, ¬)
- **WJEC**: Programming notation (!, &, |)

---

**Made for A-Level Computer Science students.** Happy simplifying!
