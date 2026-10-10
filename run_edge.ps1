param(
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$ScriptArgs
)
$pythonExe = Join-Path $PSScriptRoot "backend\venv\Scripts\python.exe"
if (-not (Test-Path $pythonExe)) {
    Write-Error "[ERROR] Virtual environment python not found at $pythonExe"
    exit 1
}
$edgeScript = Join-Path $PSScriptRoot "edge\main.py"
& $pythonExe $edgeScript @ScriptArgs
