' Launches the Reveille agent with no console window.
'
' Node has no windowless executable of its own, so running it straight from a
' Scheduled Task pops a black console window at every login. This shim starts
' it hidden instead. Used by install-agent-task.ps1; harmless to run by hand.

Dim shell, fso, here, nodeExe, entry
Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

here = fso.GetParentFolderName(WScript.ScriptFullName)
entry = fso.BuildPath(here, "src\index.js")

' The copy of Node that came with Reveille, when there is one: the installer
' ships it, so nobody has to install Node.js themselves. A copy set up by hand
' falls back to whatever node is on the PATH.
nodeExe = fso.BuildPath(here, "node\node.exe")
If Not fso.FileExists(nodeExe) Then nodeExe = "node.exe"

shell.CurrentDirectory = here
' 0 = hidden window, False = don't wait for it to exit.
shell.Run """" & nodeExe & """ """ & entry & """", 0, False
