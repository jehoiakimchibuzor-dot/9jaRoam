@echo off
pushd C:\Users\User\AndroidStudioProjects\9ja-roam-3d\android
call gradlew.bat :app:assembleDebug --console=plain --no-daemon --no-problems-report
popd
if %ERRORLEVEL% NEQ 0 exit /b %ERRORLEVEL%
endlocal