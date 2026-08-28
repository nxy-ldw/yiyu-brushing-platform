chcp 65001 | Out-Null
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

# Map Y: to this directory to bypass Chinese path issues with aapt2
$realPath = $PSScriptRoot
& "C:\Windows\System32\subst.exe" Y: $realPath
if ($LASTEXITCODE -ne 0) {
    Write-Output "SUBST FAILED, trying to remove existing mapping"
    & "C:\Windows\System32\subst.exe" Y: /D
    & "C:\Windows\System32\subst.exe" Y: $realPath
}

$project = "Y:\"
$sdkRoot = "$env:TEMP\android-sdk"
$bt = "$sdkRoot\build-tools\34.0.0"
$platform = "$sdkRoot\platforms\android-34"
$srcdir = "$project\app\src\main"
$outdir = "$project\app\build"
$keystore = "$project\debug.keystore"
$javaHome = "C:\Users\29475\AppData\Roaming\TRAE SOLO CN\ModularData\ai-agent\vm\tools\app\jre"

$env:JAVA_HOME = $javaHome
$env:PATH = "$javaHome\bin;$env:PATH"

$aapt2 = "$bt\aapt2.exe"
$d8jar = "$bt\lib\d8.jar"
$zipalign = "$bt\zipalign.exe"
$apksignerjar = "$bt\lib\apksigner.jar"
$ecjjar = "$env:TEMP\ecj.jar"

Write-Output "===== Step 1: Clean ====="
if (Test-Path $outdir) { Remove-Item $outdir -Recurse -Force }
New-Item -ItemType Directory -Force -Path "$outdir\compiled", "$outdir\gen", "$outdir\obj", "$outdir\dex", "$outdir\apk" | Out-Null

Write-Output "===== Step 2: Compile resources ====="
& $aapt2 compile --dir "$srcdir\res" -o "$outdir\compiled"
if ($LASTEXITCODE -ne 0) { Write-Output "COMPILE RES FAILED"; & "C:\Windows\System32\subst.exe" Y: /D; exit 1 }

Write-Output "===== Step 3: Link resources ====="
$flatFiles = Get-ChildItem "$outdir\compiled\*.flat" | ForEach-Object { $_.FullName }
& $aapt2 link -I "$platform\android.jar" --manifest "$srcdir\AndroidManifest.xml" --java "$outdir\gen" -o "$outdir\base.apk" --min-sdk-version 24 --target-sdk-version 34 $flatFiles
if ($LASTEXITCODE -ne 0) { Write-Output "LINK RES FAILED"; & "C:\Windows\System32\subst.exe" Y: /D; exit 1 }

Write-Output "===== Step 4: Compile Java ====="
$javaFiles = @()
$javaFiles += Get-ChildItem "$outdir\gen" -Recurse -Filter "*.java" | ForEach-Object { $_.FullName }
$javaFiles += Get-ChildItem "$srcdir\java" -Recurse -Filter "*.java" | ForEach-Object { $_.FullName }
& java -jar $ecjjar -1.8 -classpath "$platform\android.jar" -d "$outdir\obj" $javaFiles
if ($LASTEXITCODE -ne 0) { Write-Output "JAVAC FAILED"; & "C:\Windows\System32\subst.exe" Y: /D; exit 1 }

Write-Output "===== Step 5: Convert to DEX ====="
$classFiles = Get-ChildItem "$outdir\obj" -Recurse -Filter "*.class" | ForEach-Object { $_.FullName }
& java -Xmx1024M -Xss1m -cp $d8jar com.android.tools.r8.D8 --output "$outdir\dex" $classFiles
if ($LASTEXITCODE -ne 0) { Write-Output "D8 FAILED"; & "C:\Windows\System32\subst.exe" Y: /D; exit 1 }

Write-Output "===== Step 6: Add dex to APK ====="
Copy-Item "$outdir\base.apk" "$outdir\app.apk" -Force
$jarExe = "$javaHome\bin\jar.exe"
if (Test-Path $jarExe) {
    Push-Location $outdir
    & $jarExe uf app.apk -C dex classes.dex
    Pop-Location
} else {
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $zip = [System.IO.Compression.ZipFile]::Open("$outdir\app.apk", 'Update')
    $entry = $zip.GetEntry("classes.dex")
    if ($entry) { $entry.Delete() }
    $entry = $zip.CreateEntry("classes.dex")
    $stream = $entry.Open()
    $bytes = [System.IO.File]::ReadAllBytes("$outdir\dex\classes.dex")
    $stream.Write($bytes, 0, $bytes.Length)
    $stream.Flush()
    $stream.Close()
    $zip.Dispose()
}
Write-Output "Dex added"

Write-Output "===== Step 7: Generate keystore ====="
if (-not (Test-Path $keystore)) {
    & keytool -genkey -v -keystore $keystore -alias androiddebugkey -keyalg RSA -keysize 2048 -validity 10000 -storepass android -keypass android -dname "CN=Android Debug,O=Android,C=US"
}

Write-Output "===== Step 8: Zipalign ====="
& $zipalign -f 4 "$outdir\app.apk" "$outdir\app-aligned.apk"
if ($LASTEXITCODE -ne 0) { Write-Output "ZIPALIGN FAILED"; & "C:\Windows\System32\subst.exe" Y: /D; exit 1 }

Write-Output "===== Step 9: Sign APK ====="
& java -Xmx1024M -Xss1m -jar $apksignerjar sign --ks $keystore --ks-pass pass:android --ks-key-alias androiddebugkey --key-pass pass:android --out "$outdir\yiyu-app.apk" "$outdir\app-aligned.apk"
if ($LASTEXITCODE -ne 0) { Write-Output "SIGN FAILED"; & "C:\Windows\System32\subst.exe" Y: /D; exit 1 }

Write-Output ""
Write-Output "===== BUILD SUCCESS! ====="
Write-Output "APK: $outdir\yiyu-app.apk"

# Copy APK to real path
Copy-Item "$outdir\yiyu-app.apk" "$realPath\yiyu-app.apk" -Force
Write-Output "Copied to: $realPath\yiyu-app.apk"

# Cleanup subst
& "C:\Windows\System32\subst.exe" Y: /D
