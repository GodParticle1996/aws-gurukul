#!/bin/bash
# EC2 ki pehli boot par ek baar chalta hai (user data)
dnf install -y nginx
echo "ShopKaro web-1 zinda hai" > /usr/share/nginx/html/index.html
systemctl enable --now nginx
