import tarfile
import bz2
import json
import os
import glob

# Configuration
data_dir = "/Users/danielcox/Downloads/Betfair Data"
stake = 10.0
commission_rate = 0.05 # 5% commission on winning lay bets (standard Betfair)

results = {
    "total_races": 0,
    "trap2_wins_race": 0,
    "trap2_loses_race": 0,
    "total_profit_loss": 0.0,
    "country_breakdown": {}
}

# Find all tar files
tar_files = glob.glob(os.path.join(data_dir, "*.tar"))

for tar_path in tar_files:
    print(f"Processing {tar_path}...")
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
                        if m_def.get("status") == "CLOSED" and m_def.get("marketType") == "WIN":
                            runners = m_def.get("runners", [])
                            
                            trap1_runner, trap2_runner, trap3_runner = None, None, None
                            
                            for r in runners:
                                name = r.get("name", "")
                                if name.startswith("1.") or name.startswith("Trap 1") or name == "1":
                                    trap1_runner = r
                                elif name.startswith("2.") or name.startswith("Trap 2") or name == "2":
                                    trap2_runner = r
                                elif name.startswith("3.") or name.startswith("Trap 3") or name == "3":
                                    trap3_runner = r
                            
                            if trap2_runner:
                                status = trap2_runner.get("status")
                                bsp2 = trap2_runner.get("bsp")
                                if bsp2 is not None: bsp2 = float(bsp2)
                                
                                # FILTER 1: BSP must be > 5.0 (which is 4/1 in fractional odds)
                                if status in ["WINNER", "LOSER"] and bsp2 is not None and bsp2 > 5.0:
                                    
                                    # Get adjacent BSPs
                                    bsp1, bsp3 = None, None
                                    if trap1_runner and trap1_runner.get("bsp") is not None:
                                        bsp1 = float(trap1_runner.get("bsp"))
                                    if trap3_runner and trap3_runner.get("bsp") is not None:
                                        bsp3 = float(trap3_runner.get("bsp"))
                                    
                                    # FILTER 2: Adjacent traps have better odds (lower BSP).
                                    # We will require that ALL present adjacent traps have a lower BSP than Trap 2.
                                    # This implies Trap 2 is weaker than its immediate neighbors.
                                    t1_stronger = (bsp1 is not None and bsp1 < bsp2)
                                    t3_stronger = (bsp3 is not None and bsp3 < bsp2)
                                    
                                    has_adjacent = False
                                    adjacent_qualifies = True
                                    
                                    if trap1_runner:
                                        has_adjacent = True
                                        if not t1_stronger: adjacent_qualifies = False
                                        
                                    if trap3_runner:
                                        has_adjacent = True
                                        if not t3_stronger: adjacent_qualifies = False
                                        
                                    if has_adjacent and adjacent_qualifies:
                                        # Race qualifies for our criteria!
                                        
                                        results["total_races"] += 1
                                        country = m_def.get("countryCode", "UNKNOWN")
                                        
                                        if country not in results["country_breakdown"]:
                                            results["country_breakdown"][country] = {"races": 0, "profit_loss": 0.0}
                                        
                                        results["country_breakdown"][country]["races"] += 1
                                        
                                        if status == "WINNER":
                                            liability = (bsp2 - 1) * stake
                                            results["trap2_wins_race"] += 1
                                            results["total_profit_loss"] -= liability
                                            results["country_breakdown"][country]["profit_loss"] -= liability
                                            
                                        elif status == "LOSER":
                                            win_amount = stake * (1 - commission_rate)
                                            results["trap2_loses_race"] += 1
                                            results["total_profit_loss"] += win_amount
                                            results["country_breakdown"][country]["profit_loss"] += win_amount

    except Exception as e:
        print(f"Error processing {tar_path}: {e}")

print("\n=== FILTERED TRAP 2 LAYING STRATEGY ===")
print("Criteria:")
print("1. Trap 2 Odds > 4/1 (BSP > 5.0)")
print("2. Both Trap 1 and Trap 3 (if present) have lower odds than Trap 2 (Squeeze play)")
print("---------------------------------------")
print(f"Stake per race: £{stake:.2f}")
print(f"Total qualifying races: {results['total_races']}")
print(f"Trap 2 Wins (Lay Loss): {results['trap2_wins_race']}")
print(f"Trap 2 Loses (Lay Win): {results['trap2_loses_race']}")
print(f"Strike Rate (Lay Win %): {(results['trap2_loses_race']/results['total_races']*100) if results['total_races'] > 0 else 0:.2f}%")
print(f"Total Profit/Loss: £{results['total_profit_loss']:.2f}")

print("\n--- Country Breakdown ---")
for country, stats in results["country_breakdown"].items():
    print(f"{country}: {stats['races']} races, P&L: £{stats['profit_loss']:.2f}")
