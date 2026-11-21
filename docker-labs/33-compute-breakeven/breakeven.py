"""30 din ka compute model. Rates aur assumptions README mein hain."""
MONTH_HOURS = 30 * 24
FARGATE = MONTH_HOURS * 3600 * (2 * .000011244 + 4 * .000001235)
EC2_PLAN = MONTH_HOURS * .096 * .70  # Course quote: 30% off, poora commitment use hua.


def estimate(rps, ms, mb, hours):
    cost_per_rps = 30 * hours * 3600 * (.20 / 1_000_000 + ms / 1000 * mb / 1024 * .0000166667)
    return rps * cost_per_rps, FARGATE / cost_per_rps, EC2_PLAN / cost_per_rps


if __name__ == "__main__":
    print("HOST CHECK USD/30 din · 512 MB · billed 200 ms · 20 req/s")
    print("hours/day   Lambda   Fargate   EC2+plan   equal req/s (Lambda=Fargate / Lambda=EC2)")
    for hours in (1, 6, 12, 24):
        cost, cross_f, cross_e = estimate(20, 200, 512, hours)
        print(f"{hours:9}   {cost:6.2f}   {FARGATE:7.2f}   {EC2_PLAN:8.2f}   {cross_f:.2f} / {cross_e:.2f}")
