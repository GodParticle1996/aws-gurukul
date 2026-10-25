# source env.sh        → normal emulator (4566)
# source env.sh iam    → IAM-enforcing emulator (4567)
# Iske baad `aws ...` aur `terraform ...` dono laptop wale emulator se baat karte hain.
# Command bilkul asli hai — sirf AWS_ENDPOINT_URL usse AWS ki jagah laptop par bhejta hai.
_lab_dir="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd)"
if [ "${1:-}" = "iam" ]; then export AWS_ENDPOINT_URL=http://127.0.0.1:4567; else export AWS_ENDPOINT_URL=http://127.0.0.1:4566; fi
export AWS_ACCESS_KEY_ID=test AWS_SECRET_ACCESS_KEY=test     # emulator ke dummy keys — asli keys kabhi mat daalna
export AWS_DEFAULT_REGION=ap-south-1                          # Mumbai
export AWS_PAGER=""                                           # CLI v2 ka 'less' pager band
# docker ke bina chala rahe ho toh .venv ka aws CLI PATH mein
[ -x "$_lab_dir/.venv/bin/aws" ] && export PATH="$_lab_dir/.venv/bin:$PATH"
echo "🧪 aws → $AWS_ENDPOINT_URL (region $AWS_DEFAULT_REGION). Asli AWS par wapas: unset AWS_ENDPOINT_URL"
