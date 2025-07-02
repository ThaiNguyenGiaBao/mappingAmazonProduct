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

def load_scores_and_restrictions(
    mongo_uri=MONGO_URI,
    db_name=DB_NAME,
    coll_name=COL_NAME
):
    """
    Connect to MongoDB and return two parallel lists:
     - scores: each amazon_variant[0].score as float
     - restrs: each amazon_variant[0].restriction as str (or 'NULL')
    """
    client = MongoClient(mongo_uri)
    col = client[db_name][coll_name]

    scores = []
    restrs = []
    cursor = col.find(
        {},
        {"variants.amazon_variant.score": 1,
         "variants.amazon_variant.restriction": 1}
    )
    for doc in cursor:
        for variant in doc.get("variants", []):
            top_list = variant.get("amazon_variant", [])
            if not top_list:
                continue

            av = top_list[0]
            # parse score
            try:
                score = float(av.get("score", 0))
            except (TypeError, ValueError):
                score = 0.0
            # parse restriction
            restr = av.get("restriction") or "NULL"

            scores.append(score)
            restrs.append(restr)
            # for av in top_list:
                
            #     # parse score
            #     try:
            #         score = float(av.get("score", 0))
            #     except (TypeError, ValueError):
            #         score = 0.0
            #     # parse restriction
            #     restr = av.get("restriction") or "NULL"
            #     # if restr == "ACCEPTED":
            #     #     scores.append(score)
            #     # else:
            #     #     scores.append(0)
                
            #     scores.append(score)
            #     restrs.append(restr)

    client.close()
    return scores, restrs

def plot_histogram_ax(ax, scores, bin_width=BIN_WIDTH):
    """Draw the count histogram into the given Axes."""
    max_score = max(scores) if scores else 0.0
    num_bins  = int(np.ceil(max_score / bin_width))
    edges     = np.arange(0.0, (num_bins + 1) * bin_width, bin_width)

    counts, _ = np.histogram(scores, bins=edges)
    total     = counts.sum()
    labels    = [f"{edges[i]:.2f}–{edges[i+1]:.2f}" for i in range(len(counts))]

    bars = ax.bar(range(len(counts)), counts, width=0.8, align='center')
    for i, bar in enumerate(bars):
        h   = bar.get_height()
        pct = (h / total * 100) if total else 0
        ax.text(
            bar.get_x() + bar.get_width()/2,
            h + max(counts)*0.01,
            f"{pct:.3f}%",
            ha='center', va='bottom', fontsize=8
        )

    ax.set_xticks(range(len(labels)))
    ax.set_xticklabels(labels, rotation=45, ha='right')
    ax.set_ylabel('Number of Variants')
    ax.set_title(f'Count per {bin_width:.2f} Score Bin')

def plot_restriction_distribution_ax(ax, scores, restrs, bin_width=BIN_WIDTH):
    """Stacked bar: for each score‐bin, % of each restriction category, with labels."""
    # define colors per category
    COLOR_MAP = {
        "ACCEPTED":          "lightgreen",
        "APPROVAL_REQUIRED": "yellow",
        "NOT_ELIGIBLE":      "red"
    }

    edges = np.arange(0.0, 1.0 + bin_width, bin_width)
    n_bins = len(edges) - 1
    bin_idxs = np.digitize(scores, edges, right=False) - 1

    counts = np.zeros((n_bins, len(CATEGORIES)), dtype=int)
    for b, r in zip(bin_idxs, restrs):
        if 0 <= b < n_bins and r in CATEGORIES:
            counts[b, CATEGORIES.index(r)] += 1

    pct = np.zeros_like(counts, float)
    for i in range(n_bins):
        total = counts[i].sum()
        if total > 0:
            pct[i] = counts[i] / total * 100

    labels = [f"{edges[i]:.2f}–{edges[i+1]:.2f}" for i in range(n_bins)]
    bottom = np.zeros(n_bins)

    for idx, cat in enumerate(CATEGORIES):
        bottom_start = bottom.copy()
        bars = ax.bar(
            range(n_bins),
            pct[:, idx],
            bottom=bottom_start,
            label=cat,
            color=COLOR_MAP.get(cat, "gray")   # ← set color here
        )
        # annotate
        for i, bar in enumerate(bars):
            h = pct[i, idx]
            if h > 0:
                y = bottom_start[i] + h / 2
                ax.text(
                    bar.get_x() + bar.get_width()/2,
                    y,
                    f"{h:.3f}%",
                    ha='center',
                    va='center',
                    fontsize=7
                )
        bottom += pct[:, idx]

    ax.set_xticks(range(n_bins))
    ax.set_xticklabels(labels, rotation=45, ha='right')
    ax.set_xlabel('Score Range')
    ax.set_ylabel('Percentage')
    ax.set_title(f'Restriction % per {bin_width:.2f} Score Bin')
    ax.legend(title="Restriction", loc='upper left')

if __name__ == "__main__":
    scores, restrs = load_scores_and_restrictions()
    print(f"Loaded {len(scores)} scores and {len(restrs)} restrictions.")
    if not scores:
        print("No data to plot.")
        exit(0)

    # Create one figure with two rows
    fig, (ax1, ax2) = plt.subplots(nrows=2, figsize=(12, 10), constrained_layout=True)

    # Top: histogram
    plot_histogram_ax(ax1, scores, bin_width=BIN_WIDTH)

    # Bottom: stacked restriction distribution
    plot_restriction_distribution_ax(ax2, scores, restrs, bin_width=BIN_WIDTH)

    plt.show()