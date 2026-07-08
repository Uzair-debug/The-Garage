@echo off
cd /d D:\Website
git config user.email "mogamaduzair@gmail.com"
git config user.name "Uzair-debug"
git add app.js auth.js car.html index.html profile.html cloudflare-migration.md
git commit -m "Add user profile pages, owner links, Cloudflare migration guide"
git push
echo.
echo Done! Press any key to close.
pause
