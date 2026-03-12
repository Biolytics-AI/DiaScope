# Installing DiaScope Skills for Codex

## Installation

Tell Codex:

```
Fetch and follow instructions from https://raw.githubusercontent.com/Biolytics-AI/DiaScope/main/.codex/INSTALL.md
```

Or manually:

1. **Clone DiaScope:**
   ```bash
   git clone https://github.com/Biolytics-AI/DiaScope.git ~/.codex/diascope
   ```

2. **Symlink the skills:**
   ```bash
   mkdir -p ~/.agents/skills
   ln -s ~/.codex/diascope/skills ~/.agents/skills/diascope
   ```

3. **Install the CLI:**
   ```bash
   npm install -g @biolytics.ai/diascope
   ```

4. **Restart Codex.**

## Usage

```
Narrate the payment flow in src/payments/
```

```
Create a diagram story for how the sync engine works
```

## Updating

```bash
cd ~/.codex/diascope && git pull
```

## Uninstalling

```bash
rm ~/.agents/skills/diascope
rm -rf ~/.codex/diascope
npm uninstall -g @biolytics.ai/diascope
```
