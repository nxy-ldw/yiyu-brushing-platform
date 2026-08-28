@echo off
setlocal enabledelayedexpansion

set SDK=%TEMP%\android-sdk
set BT=%SDK%\build-tools\34.0.0
set PLATFORM=%SDK%\platforms\android-34
set AAPT2=%BT%\aapt2.exe
set D8=%BT%\d8.bat
set ZIPALIGN=%BT%\zipalign.exe
set APKSIGNER=%BT%\apksigner.bat
set PROJECT=%~dp0
set SRCDIR=%PROJECT%app\src\main
set OUTDIR=%PROJECT%app\build
set KEYSTORE=%PROJECT%debug.keystore

echo ===== Step 1: Clean and create output dirs =====
if exist %OUTDIR% rmdir /s /q %OUTDIR%
mkdir %OUTDIR% 2>nul
mkdir %OUTDIR%\compiled 2>nul
mkdir %OUTDIR%\gen 2>nul
mkdir %OUTDIR%\obj 2>nul
mkdir %OUTDIR%\apk 2>nul

echo ===== Step 2: Compile resources =====
%AAPT2% compile --dir %SRCDIR%\res -o %OUTDIR%\compiled
if errorlevel 1 (echo COMPILE RES FAILED & exit /b 1)

echo ===== Step 3: Link resources and generate R.java =====
%AAPT2% link -I %PLATFORM%\android.jar ^
  --manifest %SRCDIR%\AndroidManifest.xml ^
  --java %OUTDIR%\gen ^
  -o %OUTDIR%\base.apk ^
  --min-sdk-version 24 ^
  --target-sdk-version 34 ^
  -R %OUTDIR%\compiled\*.flat
if errorlevel 1 (echo LINK RES FAILED & exit /b 1)

echo ===== Step 4: Compile Java sources =====
dir /s /b %OUTDIR%\gen\*.java > %OUTDIR%\sources.txt
dir /s /b %SRCDIR%\java\*.java >> %OUTDIR%\sources.txt
javac -source 17 -target 17 -classpath %PLATFORM%\android.jar -d %OUTDIR%\obj @%OUTDIR%\sources.txt
if errorlevel 1 (echo JAVAC FAILED & exit /b 1)

echo ===== Step 5: Convert to DEX =====
dir /s /b %OUTDIR%\obj\*.class > %OUTDIR%\classes.txt
%D8% --output %OUTDIR%\dex @%OUTDIR%\classes.txt
if errorlevel 1 (echo D8 FAILED & exit /b 1)

echo ===== Step 6: Add dex to APK =====
cd %OUTDIR%
copy base.apk app.apk >nul
"%JAVA_HOME%\bin\jar" uf app.apk -C dex classes.dex
if errorlevel 1 (echo ADD DEX FAILED & exit /b 1)

echo ===== Step 7: Generate debug keystore =====
if not exist %KEYSTORE% (
  keytool -genkey -v -keystore %KEYSTORE% -alias androiddebugkey -keyalg RSA -keysize 2048 -validity 10000 -storepass android -keypass android -dname "CN=Android Debug,O=Android,C=US"
)

echo ===== Step 8: Zipalign =====
%ZIPALIGN% -f 4 %OUTDIR%\app.apk %OUTDIR%\app-aligned.apk
if errorlevel 1 (echo ZIPALIGN FAILED & exit /b 1)

echo ===== Step 9: Sign APK =====
%APKSIGNER% sign --ks %KEYSTORE% --ks-pass pass:android --ks-key-alias androiddebugkey --key-pass pass:android --out %OUTDIR%\yiyu-app.apk %OUTDIR%\app-aligned.apk
if errorlevel 1 (echo SIGN FAILED & exit /b 1)

echo.
echo ===== BUILD SUCCESS! =====
echo APK: %OUTDIR%\yiyu-app.apk
