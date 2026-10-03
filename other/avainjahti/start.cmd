@echo off
rem Avainjahti - kaynnistaa paikallisen palvelimen ja avaa sivun selaimessa.
rem Palvelinta tarvitaan vain LIVE-tilassa: file:// -osoitteesta selain voi
rem estaa saldokutsut. DEMO-tila toimii myos suoraan index.html:aa avaamalla.

cd /d "%~dp0"

echo.
echo   Key Hunt
echo   http://localhost:8777/
echo.
echo   Close this window to stop the server.
echo.

start "keyhunt-server" /min cmd /c python -m http.server 8777
timeout /t 1 /nobreak >nul
start "" http://localhost:8777/
