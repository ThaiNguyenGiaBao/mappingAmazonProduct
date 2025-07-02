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