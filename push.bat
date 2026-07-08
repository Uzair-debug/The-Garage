@echo off
cd /d D:\Website
git config user.email "mogamaduzair@gmail.com"
git config user.name "Uzair-debug"
git add -A
git commit -m "Update site"
git push
echo.
echo Done! Press any key to close.
pause
