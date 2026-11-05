@echo off
setlocal
set JAVA_HOME=C:\Program Files\Android\Android Studio\jbr
set ANDROID_HOME=%LOCALAPPDATA%\Android\Sdk
cd /d C:\Users\User\AndroidStudioProjects\9ja-roam-3d\android
gradlew.bat :app:assembleDebug --console=plain --no-daemon --no-problems-report
endlocal