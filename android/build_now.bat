@echo off
setlocal
set JAVA_HOME=C:\Program Files\Android\Android Studio\jbr
set ANDROID_HOME=C:\Users\User\AppData\Local\Android\Sdk
cd /d C:\Users\User\AndroidStudioProjects\9ja-roam-3d\android
call gradlew.bat :app:assembleDebug --console=plain --no-daemon --no-problems-report
popd
endlocal
