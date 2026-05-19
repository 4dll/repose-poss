Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
projectDir = fso.GetParentFolderName(WScript.ScriptFullName)

shell.CurrentDirectory = projectDir
shell.Run "cmd /c start-pos-windows.bat", 0, False
WScript.Sleep 3000
shell.Run "http://localhost:3002", 1, False
