"""PixShare ki chhoti test photo. Har 2x2 block ka average ek thumbnail pixel hai."""
def thumbnail(event, context=None):
    rows = event["pixels"]
    return [[sum(rows[y + dy][x + dx] for dy in range(2) for dx in range(2)) // 4
             for x in range(0, len(rows[0]), 2)] for y in range(0, len(rows), 2)]
