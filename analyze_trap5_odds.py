import tarfile
import bz2
import json
import os
import glob

# Configuration
data_dir = "/Users/danielcox/Downloads/Betfair Data"
stake = 10.0
commission_rate = 0.05 # 5% commission on winning lay bets

# We will test these thresholds for Trap 5
thresholds = [1.5, 2.0, 2.5, 3.0, 3.5, 4.0, 4.5, 5.0, 100.0] 
results = {t: {"races": 0, "wins": 0, "loses": 0, "profit": 0.0} for t in thresholds}

tar_files = glob.glob(os.path.join(data_dir, "*.tar"))

for tar_path in tar_files:
    try:
        with tarfile.open(tar_path, "r") as tar:
            for member in tar.getmembers():
                if member.isfile() and member.name.endswith(".bz2"):
                    markets = {}
                    f = tar.extractfile(member)
                    with bz2.BZ2File(f, "r") as bz2_file:
                        for line in bz2_file:
                            try:
                                data = json.loads(line.decode("utf-8"))
                                if "mc" in data:
                                    for market in data["mc"]:
                                        market_id = market.get("id")
                                        if "marketDefinition" in market:
                                            markets[market_id] = market["marketDefinition"]
                            except:
                                pass
                    
                    for m_id, m_def in markets.items():
                        # ONLY GB races
                        if m_def.get("status") == "CLOSED" and m_def.get("marketType") == "WIN" and m_def.get("countryCode") == "GB":
                            runners = m_def.get("runners", [])
                            
                            trap5_runner, trap6_runner = None, None
                            
                            for r in runners:
                                name = r.get("name", "")
                                if name.startswith("5.") or name.startswith("Trap 5") or name == "5":
                                    trap5_runner = r
                                elif name.startswith("6.") or name.startswith("Trap 6") or name == "6":
                                    trap6_runner = r
                            
                            if trap5_runner and trap6_runner:
                                status6 = trap6_runner.get("status")
                                bsp6 = trap6_runner.get("bsp")
                                if bsp6 is not None: bsp6 = float(bsp6)
                                
                                bsp5 = trap5_runner.get("bsp")
                                if bsp5 is not None: bsp5 = float(bsp5)
                                
                                # Our base criteria: Lay Trap 6 if > 5.0 and Trap 5 < Trap 6
                                if status6 in ["WINNER", "LOSER"] and bsp6 is not None and bsp6 > 5.0 and bsp5 is not None and bsp5 < bsp6:
                                    
                                    for t in thresholds:
                                        if bsp5 <= t:
                                            results[t]["races"] += 1
                                            if status6 == "WINNER":
                                                liability = (bsp6 - 1) * stake
                                                results[t]["wins"] += 1
                                                results[t]["profit"] -= liability
                                            elif status6 == "LOSER":
                                                win_amount = stake * (1 - commission_rate)
                                                results[t]["loses"] += 1
                                                results[t]["profit"] += win_amount
    except Exception as e:
        pass

print("\n=== TRAP 5 ODDS THRESHOLD ANALYSIS (UK) ===")
print("Criteria: Lay Trap 6 if > 4/1, Trap 5 < Trap 6, AND Trap 5 <= Threshold")
print("-------------------------------------------------")
for t in thresholds:
    stats = results[t]
    if stats["races"] > 0:
        sr = (stats["loses"] / stats["races"]) * 100
        label = f"Trap 5 <= {t}" if t < 100 else "All qualifying Trap 5s"
        print(f"{label:22} | {stats['races']:5} races | SR: {sr:.2f}% | P&L: £{stats['profit']:8.2f}")
    else:
        print(f"Trap 5 <= {t}: No qualifying races")
