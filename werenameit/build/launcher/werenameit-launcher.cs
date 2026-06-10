using System;
using System.Diagnostics;
using System.IO;
using System.Windows.Forms;

internal static class Program
{
    [STAThread]
    private static int Main()
    {
        string baseDirectory = AppDomain.CurrentDomain.BaseDirectory;
        string appExecutable = Path.Combine(baseDirectory, "app", "werenameit.exe");

        if (!File.Exists(appExecutable))
        {
            MessageBox.Show(
                "Cannot find app\\werenameit.exe. Please keep the app folder next to werenameit.exe.",
                "werenameit",
                MessageBoxButtons.OK,
                MessageBoxIcon.Error
            );
            return 1;
        }

        Process.Start(new ProcessStartInfo
        {
            FileName = appExecutable,
            WorkingDirectory = Path.GetDirectoryName(appExecutable),
            UseShellExecute = true
        });

        return 0;
    }
}
