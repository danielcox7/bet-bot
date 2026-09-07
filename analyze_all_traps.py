import tarfile
import bz2
import json
import os
import glob

# Configuration
data_dir = "/Users/danielcox/Downloads/Betfair Data"
stake = 10.0
commission_rate = 0.05 # 5% commission on winning lay bets

results = {trap: {"races": 0, "wins": 0, "loses": 0, "profit": 0.0} for trap in range(1, 7)}

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
                            
                            # Map trap number to runner data
                            trap_runners = {}
                            for r in runners:
                                name = r.get("name", "")
                                for t in range(1, 7):
                                    if name.startswith(f"{t}.") or name.startswith(f"Trap {t}") or name == str(t):
                                        trap_runners[t] = r
                                        break
                            
                            # Evaluate each trap for the squeeze strategy
                            for t in range(1, 7):
                                if t not in trap_runners: continue
                                
                                target = trap_runners[t]
                                status = target.get("status")
                                bsp = target.get("bsp")
                                if bsp is not None: bsp = float(bsp)
                                
                                if status in ["WINNER", "LOSER"] and bsp is not None and bsp > 5.0:
                                    
                                    # Get neighbors
                                    left = trap_runners.get(t - 1)
                                    right = trap_runners.get(t + 1)
                                    
                                    bsp_left = float(left.get("bsp")) if left and left.get("bsp") is not None else None
                                    bsp_right = float(right.get("bsp")) if right and right.get("bsp") is not None else None
                                    
                                    has_neighbor = False
                                    squeezed = True
                                    
                                    if left:
                                        has_neighbor = True
                                        if bsp_left is None or bsp_left >= bsp:
                                            squeezed = False
                                    
                                    if right:
                                        has_neighbor = True
                                        if bsp_right is None or bsp_right >= bsp:
                                            squeezed = False
                                            
                                    if has_neighbor and squeezed:
                                        results[t]["races"] += 1
                                        
                                        if status == "WINNER":
                                            liability = (bsp - 1) * stake
                                            results[t]["wins"] += 1
                                            results[t]["profit"] -= liability
                                        elif status == "LOSER":
                                            win_amount = stake * (1 - commission_rate)
                                            results[t]["loses"] += 1
                                            results[t]["profit"] += win_amount

    except Exception as e:
        pass

print("\n=== UK GREYHOUND SQUEEZE STRATEGY BY TRAP ===")
print("Criteria: Target trap > 4/1, and all adjacent traps have lower odds.")
print("-------------------------------------------------")
for t in range(1, 7):
    stats = results[t]
    if stats["races"] > 0:
        sr = (stats["loses"] / stats["races"]) * 100
        print(f"Trap {t}: {stats['races']} races | SR: {sr:.2f}% | P&L: £{stats['profit']:.2f}")
    else:
        print(f"Trap {t}: No qualifying races")
