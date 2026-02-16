# 🔨 Whack-a-Mole

A browser-based Whack-a-Mole arcade game with a retro **Tk/Tix-inspired** UI aesthetic.
Built with vanilla HTML5, CSS, and JavaScript — zero dependencies.

## 🎮 How to Play

| Action           | Control       |
|------------------|---------------|
| Whack a mole     | Click / Tap   |
| Start game       | Click **Start** button |
| Pause            | Click **Pause** button |

- Moles pop up from holes at random — **click them** before they hide!
- Each whack scores **+10 points**.
- Misclicks cost **−5 points**.
- Golden moles are worth **+25 points** — but they're faster!
- Speed increases as your score climbs.
- You have **30 seconds** per round.

## ✨ Features

- Retro Tk/Tix-inspired widget aesthetic (raised borders, system fonts, button relief)
- Smooth CSS animations for mole pop-up / retreat
- Score, high score (localStorage), timer, and combo counter
- Progressive difficulty — moles appear faster over time
- Golden bonus moles
- Responsive grid — works on desktop & mobile
- Zero dependencies — pure HTML / CSS / JS

## 🚀 Getting Started

```bash
git clone https://github.com/AjeeshkumarGIT/whack-a-mole.git
cd whack-a-mole

# Open in your browser
start index.html        # Windows
open index.html         # macOS
xdg-open index.html     # Linux
```

Or use VS Code **Live Server** for auto-reload.

## 📂 Project Structure

```
whack-a-mole/
├── index.html          # Game page
├── css/
│   └── style.css       # Tk-inspired retro styles
├── js/
│   └── game.js         # Game engine & logic
├── LICENSE
└── README.md
```

## 📜 License

MIT
