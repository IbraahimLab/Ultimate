@echo off
setlocal

if "%~1"=="" (
  echo Usage: release.cmd ^<version^>
  echo Example: release.cmd 0.1.0
  exit /b 1
)

set "VERSION=%~1"
set "TAG=v%VERSION%"

set "MAJOR="
set "MINOR="
set "PATCH="
set "EXTRA="
for /f "tokens=1,2,3,4 delims=." %%a in ("%VERSION%") do (
  set "MAJOR=%%a"
  set "MINOR=%%b"
  set "PATCH=%%c"
  set "EXTRA=%%d"
)

if not defined MAJOR goto :semver_error
if not defined MINOR goto :semver_error
if not defined PATCH goto :semver_error
if defined EXTRA goto :semver_error

set /a _SEMVER_NUM=%MAJOR%+0 >nul 2>&1
if errorlevel 1 goto :semver_error
set /a _SEMVER_NUM=%MINOR%+0 >nul 2>&1
if errorlevel 1 goto :semver_error
set /a _SEMVER_NUM=%PATCH%+0 >nul 2>&1
if errorlevel 1 goto :semver_error

goto :semver_ok

:semver_error
echo ERROR: Version must be semver like 0.1.0
exit /b 1

:semver_ok

where git >nul 2>&1
if errorlevel 1 (
  echo ERROR: git not found in PATH.
  exit /b 1
)

where node >nul 2>&1
if errorlevel 1 (
  echo ERROR: node not found in PATH.
  exit /b 1
)

where python >nul 2>&1
if errorlevel 1 (
  echo ERROR: python not found in PATH.
  exit /b 1
)

for /f %%i in ('node -p "require('./package.json').version"') do set "NPM_VERSION=%%i"
if /I not "%NPM_VERSION%"=="%VERSION%" (
  echo ERROR: package.json version is %NPM_VERSION% but expected %VERSION%.
  echo Update package.json first.
  exit /b 1
)

findstr /C:"version = \"%VERSION%\"" "packages\python-sdk\pyproject.toml" >nul
if errorlevel 1 (
  echo ERROR: packages/python-sdk/pyproject.toml version is not %VERSION%.
  echo Update pyproject.toml first.
  exit /b 1
)

git diff --quiet
if errorlevel 1 (
  echo ERROR: Working tree has unstaged changes. Commit or stash first.
  exit /b 1
)

git diff --cached --quiet
if errorlevel 1 (
  echo ERROR: Working tree has staged but uncommitted changes. Commit first.
  exit /b 1
)

git rev-parse --verify "%TAG%" >nul 2>&1
if not errorlevel 1 (
  echo ERROR: Local tag %TAG% already exists.
  exit /b 1
)

for /f %%i in ('git ls-remote --tags origin "%TAG%"') do set "REMOTE_TAG=%%i"
if defined REMOTE_TAG (
  echo ERROR: Remote tag %TAG% already exists on origin.
  exit /b 1
)

echo Running release checks...
call npm ci
if errorlevel 1 exit /b 1

call npm run check
if errorlevel 1 exit /b 1

call npm run build
if errorlevel 1 exit /b 1

call npm run pack:dry
if errorlevel 1 exit /b 1

call npm run build:py
if errorlevel 1 exit /b 1

echo Creating and pushing tag %TAG%...
git tag "%TAG%"
if errorlevel 1 exit /b 1

git push origin "%TAG%"
if errorlevel 1 exit /b 1

echo.
echo Success.
echo Tag %TAG% pushed.
echo GitHub Actions will publish:
echo - npm from .github/workflows/release-npm.yml
echo - PyPI from .github/workflows/release-pypi.yml
echo.
echo For PyPI: if trusted publishing is configured, no token is needed.
echo If not configured, workflow publish will fail until trusted publishing is set up.
exit /b 0
