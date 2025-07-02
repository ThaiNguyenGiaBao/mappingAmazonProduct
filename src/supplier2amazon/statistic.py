#!/usr/bin/env python3
import os
import numpy as np
import matplotlib.pyplot as plt
from pymongo import MongoClient

# ─── CONFIG ────────────────────────────────────────────────────────────────────
MONGO_URI    = os.getenv(
    "MONGODB_URI",
    "mongodb+srv://thainguyengiabao27092004:awMvZMpA0Z9B4cls@cluster0.04q1y2b.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0"
)
DB_NAME      = "DropshipProducts"
COL_NAME     = "amazon_product_mapping"
BIN_WIDTH    = 0.05
CATEGORIES   = ["ACCEPTED", "APPROVAL_REQUIRED", "NOT_ELIGIBLE"]
# ────────────────────────────────────────────────────────────────────────────────

def load_scores_and_restrictions(mongo_uri=MONGO_URI, db_name=DB_NAME, coll_name=COL_NAME):
    """Fetch top-score and top-restriction for each variant."""
    client = MongoClient(mongo_uri)
    col = client[db_name][coll_name]

    scores, restrs = [], []
    for doc in col.find({}, {"variants.amazon_variant.score":1,"variants.amazon_variant.restriction":1}):
        for variant in doc.get("variants", []):
            av_list = variant.get("amazon_variant", [])
            if not av_list:
                continue
            
            # av = av_list[0]
            # # parse score
            # try:
            #     score = float(av.get("score", 0))
            # except (TypeError, ValueError):
            #     score = 0.0
            # # parse restriction
            # restr = av.get("restriction") or "NULL"

            # scores.append(score)
            # restrs.append(restr)
            
            for av in av_list:
                # parse score
                restr = av.get("restriction") or "NULL"
                if restr == "ACCEPTED":
                    try:
                        score = float(av.get("score", 0))
                    except (TypeError, ValueError):
                        score = 0.0
                    restr = av.get("restriction") or "NULL"
                    
                    scores.append(score)
                    restrs.append(restr)
                    if scores == 0.0:
                        print(f"Found score 0.0 with ACCEPTED restriction in {doc['_id']}")
                    break
            else:
                scores.append(0.0)
                restrs.append("NOT_ELIGIBLE")

    client.close()
    return scores, restrs

def load_accepted_positions(mongo_uri=MONGO_URI, db_name=DB_NAME, coll_name=COL_NAME):
    """
    For each variant, find the index of the first amazon_variant
    whose restriction == "ACCEPTED". Return a list of those indices.
    """
    client = MongoClient(mongo_uri)
    col = client[db_name][coll_name]

    positions = []
    for doc in col.find({}):
        for variant in doc.get("variants", []):
            for idx, av in enumerate(variant.get("amazon_variant", [])):
                if av.get("restriction") == "ACCEPTED":
                    positions.append(idx)
                    break
                    
                
            # if no ACCEPTED in this variant, skip
    client.close()
    return positions

def plot_histogram_ax(ax, scores, bin_width=BIN_WIDTH):
    """Count histogram of top scores."""
    max_score = max(scores) if scores else 0.0
    num_bins  = int(np.ceil(max_score / bin_width))
    edges     = np.arange(0.0, (num_bins+1)*bin_width, bin_width)

    counts, _ = np.histogram(scores, bins=edges)
    total     = counts.sum()
    labels    = [f"{edges[i]:.2f}–{edges[i+1]:.2f}" for i in range(len(counts))]

    bars = ax.bar(range(len(counts)), counts, width=0.8, align='center')
    for i, bar in enumerate(bars):
        h   = bar.get_height()
        pct = (h/total*100) if total else 0
        ax.text(bar.get_x()+bar.get_width()/2,
                h + max(counts)*0.01,
                f"{pct:.1f}%",
                ha='center', va='bottom', fontsize=8)

    ax.set_xticks(range(len(labels)))
    ax.set_xticklabels(labels, rotation=45, ha='right')
    ax.set_ylabel('Variants')
    ax.set_title('Top‐Score Distribution')

def plot_restriction_distribution_ax(ax, scores, restrs, bin_width=BIN_WIDTH):
    """Stacked bar of restriction % per score‐bin."""
    COLOR_MAP = {"ACCEPTED":"lightgreen","APPROVAL_REQUIRED":"yellow","NOT_ELIGIBLE":"red"}

    edges = np.arange(0.0, 1.0+bin_width, bin_width)
    n_bins = len(edges)-1
    bin_idxs = np.digitize(scores, edges, right=False)-1

    counts = np.zeros((n_bins, len(CATEGORIES)), int)
    for b,r in zip(bin_idxs, restrs):
        if 0<=b<n_bins and r in CATEGORIES:
            counts[b, CATEGORIES.index(r)] += 1

    pct = np.zeros_like(counts, float)
    for i in range(n_bins):
        tot = counts[i].sum()
        if tot>0:
            pct[i] = counts[i]/tot*100

    labels = [f"{edges[i]:.2f}–{edges[i+1]:.2f}" for i in range(n_bins)]
    bottom = np.zeros(n_bins)
    for idx,cat in enumerate(CATEGORIES):
        bs = ax.bar(range(n_bins), pct[:,idx], bottom=bottom,
                    label=cat, color=COLOR_MAP[cat])
        for i,bar in enumerate(bs):
            h = pct[i,idx]
            if h>0:
                y = bottom[i]+h/2
                ax.text(bar.get_x()+bar.get_width()/2,
                        y, f"{h:.1f}%", ha='center', va='center', fontsize=7)
        bottom += pct[:,idx]

    ax.set_xticks(range(n_bins))
    ax.set_xticklabels(labels, rotation=45, ha='right')
    ax.set_ylabel('% Variants')
    ax.set_title('Restriction % per Score Bin')
    ax.legend(title="Restriction")

def plot_accepted_position_distribution_ax(ax, positions):
    """
    Bar chart of how many times each amazon_variant index
    is the first ACCEPTED result.
    """
    if not positions:
        ax.text(0.5, 0.5, "No ACCEPTED variants", ha='center')
        return

    max_pos = max(positions)
    counts  = [positions.count(i) for i in range(max_pos+1)]
    total   = sum(counts)
    labels  = [str(i) for i in range(max_pos+1)]

    bars = ax.bar(range(max_pos+1), counts, color='lightgreen', align='center')
    for i,bar in enumerate(bars):
        h = bar.get_height()
        pct = h/total*100 if total else 0
        ax.text(bar.get_x()+bar.get_width()/2,
                h + max(counts)*0.01,
                f"{pct:.1f}%",
                ha='center', va='bottom', fontsize=8)

    ax.set_xticks(range(max_pos+1))
    ax.set_xticklabels(labels)
    ax.set_xlabel('Amazon Variant Index')
    ax.set_ylabel('Count')
    ax.set_title('Position of First ACCEPTED in amazon_variant')

if __name__ == "__main__":
    scores, restrs   = load_scores_and_restrictions()
    #positions        = load_accepted_positions()
    
    print(f"Loaded {len(scores)} scores and {len(restrs)} restrictions.")
    #print(f"Found {len(positions)} ACCEPTED positions.")

    if not scores:
        print("No data to plot.")
        exit(0)

    fig, axes = plt.subplots(nrows=3, figsize=(12, 12), constrained_layout=True)
    plot_histogram_ax(axes[0], scores)
    plot_restriction_distribution_ax(axes[1], scores, restrs)
    #plot_accepted_position_distribution_ax(axes[2], positions)
    plt.show()
