import re

with open("src/App.jsx", "r") as f:
    content = f.read()

# 1. Remove qualifiedRaces state block and toggleQualified etc.
pattern1 = re.compile(r'  const \[qualifiedRaces, setQualifiedRaces\].*?  \}, \[qualifiedRaces\]\);\n', re.DOTALL)
content = pattern1.sub('', content)

# 2. Replace the setInterval
pattern2 = re.compile(r'// Periodically check qualified races for green condition.*?\}, \[qualifiedRaces, races\]\);', re.DOTALL)
replacement2 = """// Periodically check all upcoming races for Trap 5/6 criteria
useEffect(() => {
  if (!races || races.length === 0) return;

  const intervalId = setInterval(() => {
    const now = new Date();
    
    races.forEach(async (race) => {
      // Parse race.time (HH:MM in London)
      const m = race.time.match(/(\\d+):(\\d+)\\s*([AP]M)?/i);
      if (!m) return;

      let hour = parseInt(m[1], 10);
      const minute = parseInt(m[2], 10);
      const meridiem = m[3];
      if (meridiem) {
        const isPM = meridiem.toUpperCase() === 'PM';
        if (hour === 12) hour = isPM ? 12 : 0;
        else if (isPM) hour += 12;
      }
      
      const raceStartTime = new Date(now);
      raceStartTime.setHours(hour, minute, 0, 0);

      const diffMs = raceStartTime - now;
      const diffMinutes = Math.floor(diffMs / 60000);

      // Check if race is exactly 0-2 minutes away
      if (diffMinutes >= 0 && diffMinutes <= 2) {
        if (localStorage.getItem(`betbot_alert_sent_${race.id}`)) return;
        
        try {
          const market = await getMarketBook(race.id);
          let trap5Odds = 0;
          let trap6Odds = 0;
          let trap5Dog = "";
          let trap6Dog = "";

          market?.runners?.forEach((runner) => {
            const staticInfo = race.runners?.find((r) => r.selectionId === runner.selectionId);
            if (staticInfo) {
              const dogName = staticInfo.runnerName;
              const backOdds = parseFloat(runner.ex?.availableToBack?.[0]?.price ?? 0);
              
              if (dogName.startsWith("5. ")) {
                trap5Odds = backOdds;
                trap5Dog = dogName.replace("5. ", "").trim();
              } else if (dogName.startsWith("6. ")) {
                trap6Odds = backOdds;
                trap6Dog = dogName.replace("6. ", "").trim();
              }
            }
          });

          if (trap6Odds >= 5 && trap5Odds > 0 && trap5Odds <= 3) {
            const message = `🚨 Criteria Met: ${race.venue} at ${race.time}\\n\\nTrap 5 (${trap5Dog}): ${trap5Odds}\\nTrap 6 (${trap6Dog}): ${trap6Odds}`;
            await sendTelegramAlert(message);
            localStorage.setItem(`betbot_alert_sent_${race.id}`, 'true');
          }
        } catch (err) {
          console.error(`Error checking pending alerts for ${race.id}:`, err);
        }
      }
    });
  }, 10000); // Poll every 10s for live odds checking

  return () => clearInterval(intervalId);
}, [races]);"""
content = pattern2.sub(lambda m: replacement2, content)

# 3. Remove fetch("/api/qualified") block
pattern3 = re.compile(r'    if \(Array\.isArray\(data\) && data\.length > 0\) \{\n      fetch\("/api/qualified".*?console\.error\("API sync races error:", err\)\);\n    \}\n', re.DOTALL)
content = pattern3.sub('', content)

# 4. Remove resetting qualified races once per calendar day
pattern4 = re.compile(r'  // Reset qualified races once per calendar day\n.*?    setQualifiedRaces\(\[\]\);\n  \}', re.DOTALL)
replacement4 = """  // Update last clear date
  const lastClear = localStorage.getItem('betbot_last_clear');
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  if (lastClear !== today) {
    localStorage.setItem('betbot_last_clear', today);
  }"""
content = pattern4.sub(lambda m: replacement4, content)

# 5. Remove checkbox for showQualifiedOnly
pattern5 = re.compile(r'            <span style=\{styles\.checkboxLabel\}>\n              <input\n                type="checkbox"\n                checked=\{showQualifiedOnly\}\n                onChange=\{.*?\}\n                style=\{styles\.checkbox\}\n              />\n              Show Qualified Only\n            </span>\n', re.DOTALL)
content = pattern5.sub('', content)

# 6. Remove filter for showQualifiedOnly
content = content.replace("                        if (showQualifiedOnly && !qualifiedRaces.includes(race.id)) return false;\n", "")

# 7. Replace table row styling
pattern7 = re.compile(r'                      <tr \n                        style=\{qualifiedRaces\.includes\(race\.id\) \? \{ \.\.\.styles\.tableRow, \.\.\.styles\.qualifiedRow, cursor: "pointer" \} : \{ \.\.\.styles\.tableRow, cursor: "pointer" \}\}\n                        onClick=\{\(\) => toggleQualified\(race\.id\)\}\n                      >', re.DOTALL)
replacement7 = """                      <tr 
                        style={{ ...styles.tableRow, cursor: "pointer" }}
                      >"""
content = pattern7.sub(lambda m: replacement7, content)

with open("src/App.jsx", "w") as f:
    f.write(content)
