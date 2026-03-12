# Installing DiaScope Skills for Claude Code

Adds the `narrate` skill to Claude Code so you can say "narrate this folder" and get an interactive diagram story.

## Installation

1. **Clone DiaScope:**
   ```bash
   git clone https://github.com/Biolytics-AI/DiaScope.git ~/.claude/diascope
   ```

2. **Symlink the skills:**
   ```bash
   mkdir -p ~/.agents/skills
   ln -s ~/.claude/diascope/skills ~/.agents/skills/diascope
   ```

3. **Install the CLI** (required for the skill to build stories):
   ```bash
   npm install -g @biolytics.ai/diascope
   ```

4. **Restart Claude Code.**

## Verify

```bash
ls -la ~/.agents/skills/diascope
# should show symlink → ~/.claude/diascope/skills
```

## Usage

Once installed, just tell Claude Code what you want to explain:

```
Narrate the authentication flow in src/auth/
```

```
Create a diagram story for how the payment service works
```

```
Explain the request lifecycle in this repo to a new developer
```

Claude will read your code, write a D2 diagram, author the narration, and produce a self-contained `story.html` you can open in a browser.

## Updating

```bash
cd ~/.claude/diascope && git pull
```

## Uninstalling

```bash
rm ~/.agents/skills/diascope
rm -rf ~/.claude/diascope
npm uninstall -g @biolytics.ai/diascope
```
