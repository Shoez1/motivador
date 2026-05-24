@echo off
setlocal enabledelayedexpansion
chcp 65001 >nul
title Compilando APK - Motivador Diario
color 0A

echo.
echo ============================================================
echo       COMPILANDO APK - MOTIVADOR DIARIO
echo ============================================================
echo.

cd /d "%~dp0"
if errorlevel 1 (
    echo [ERRO] Nao foi possivel acessar o diretorio do projeto!
    pause
    exit /b 1
)

REM Verificar se parece ser um projeto Android (Gradle)
if not exist "%~dp0app\build.gradle.kts" (
    if not exist "%~dp0app\build.gradle" (
        echo.
        echo [ERRO] Projeto Android nao encontrado em:
        echo %~dp0
        echo.
        echo Arquivo esperado: app\build.gradle.kts (ou app\build.gradle)
        echo.
        pause
        exit /b 1
    )
)

REM Configurar DevKit (JDK, Android SDK, build-tools e Gradle cache)
set "DEVKIT_ENV=%~dp0..\DevKit\setup-apk-env.bat"
if not exist "%DEVKIT_ENV%" set "DEVKIT_ENV=X:\Projetos\APKs\DevKit\setup-apk-env.bat"
if not exist "%DEVKIT_ENV%" (
    echo [ERRO] setup-apk-env.bat nao encontrado em X:\Projetos\APKs\DevKit
    pause
    exit /b 1
)
call "%DEVKIT_ENV%"
if errorlevel 1 (
    echo [ERRO] Falha ao configurar o DevKit.
    pause
    exit /b 1
)

REM Garantir local.properties com o SDK do DevKit
> "%~dp0local.properties" echo sdk.dir=%SDK_DIR_FORWARD%

REM Verificar se gradlew.bat existe
if not exist "gradlew.bat" (
    echo.
    echo [ERRO] gradlew.bat nao encontrado na raiz do projeto!
    echo.
    echo Gere o Gradle Wrapper abrindo no Android Studio, ou execute:
    echo   gradle wrapper
    echo.
    pause
    exit /b 1
)

echo [INFO] JAVA_HOME: %JAVA_HOME%
echo [INFO] ANDROID_HOME: %ANDROID_HOME%
echo [INFO] Diretorio atual: %CD%
echo.

echo [1/3] Limpando build anterior...
echo [INFO] Parando daemons do Gradle...
call gradlew.bat --stop 2>nul
echo [INFO] Removendo arquivos de build...
if exist app\build (
    rmdir /s /q app\build 2>nul
)
if exist .gradle (
    rmdir /s /q .gradle 2>nul
)
echo [OK] Limpeza concluida
echo.

echo [2/3] Compilando APK Release...
echo [INFO] Este processo pode demorar alguns minutos...
echo.
echo Executando: gradlew.bat --no-daemon --max-workers=2 assembleRelease
echo.
call gradlew.bat --no-daemon --max-workers=2 assembleRelease
set BUILD_RESULT=%ERRORLEVEL%

echo.
echo Build finalizado com codigo de saida: %BUILD_RESULT%
echo.

set "OUTDIR=%~dp0OUTPUT"
if not exist "%OUTDIR%" mkdir "%OUTDIR%" >nul 2>&1

if %BUILD_RESULT% EQU 0 (
    if exist app\build\outputs\apk\release\app-release.apk (
        echo.
        echo ============================================================
        echo       BUILD CONCLUIDO COM SUCESSO!
        echo ============================================================
        echo.
        echo APK gerado em:
        echo %CD%\app\build\outputs\apk\release\app-release.apk
        echo.
        copy /y "app\build\outputs\apk\release\app-release.apk" "%OUTDIR%\motivador-release.apk" >nul
        echo Copiado para:
        echo %OUTDIR%\motivador-release.apk
        echo.
        for %%F in ("%OUTDIR%\motivador-release.apk") do (
            set /a sizeMB=%%~zF/1024/1024
            echo Tamanho: %%~zF bytes ^(~!sizeMB! MB^)
            echo Data: %%~tF
        )
    ) else if exist app\build\outputs\apk\release\app-release-unsigned.apk (
        echo.
        echo ============================================================
        echo       BUILD CONCLUIDO COM SUCESSO! ^(UNSIGNED^)
        echo ============================================================
        echo.
        echo APK gerado em:
        echo %CD%\app\build\outputs\apk\release\app-release-unsigned.apk
        echo.
        copy /y "app\build\outputs\apk\release\app-release-unsigned.apk" "%OUTDIR%\motivador-release-unsigned.apk" >nul
        echo Copiado para:
        echo %OUTDIR%\motivador-release-unsigned.apk
        echo.
        for %%F in ("%OUTDIR%\motivador-release-unsigned.apk") do (
            set /a sizeMB=%%~zF/1024/1024
            echo Tamanho: %%~zF bytes ^(~!sizeMB! MB^)
            echo Data: %%~tF
        )
    ) else (
        echo.
        echo [ERRO] APK nao foi encontrado apos o build
        echo Verifique os logs acima para mais detalhes.
        set FINAL_EXIT_CODE=1
    )
) else (
    echo.
    echo ============================================================
    echo       ERRO NO BUILD
    echo ============================================================
    echo.
    echo Verifique os logs acima para detalhes do erro.
    set FINAL_EXIT_CODE=1
)

if not defined FINAL_EXIT_CODE (
    set FINAL_EXIT_CODE=0
)

echo.
echo Pressione qualquer tecla para sair...
pause
set EXIT_CODE=!FINAL_EXIT_CODE!
endlocal
exit /b %EXIT_CODE%
