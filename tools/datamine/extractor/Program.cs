using System.Reflection;
using CUE4Parse.Compression;
using CUE4Parse.Encryption.Aes;
using CUE4Parse.FileProvider;
using CUE4Parse.MappingsProvider;
using CUE4Parse.UE4.Assets;
using CUE4Parse.UE4.Objects.Core.Misc;
using CUE4Parse.UE4.Versions;

var paks = Environment.GetEnvironmentVariable("FELLOWSHIP_PAKS")
    ?? @"C:\Program Files (x86)\Steam\steamapps\common\Fellowship\fellowship\Content\Paks";
var cmd = args.Length > 0 ? args[0] : "list";
var game = args.Length > 1 ? Enum.Parse<EGame>(args[1]) : EGame.GAME_UE5_4;

var oodle = Path.Combine(AppContext.BaseDirectory, OodleHelper.OODLE_NAME_OLD);
if (!File.Exists(oodle)) await OodleHelper.DownloadOodleDllAsync(ref oodle);
OodleHelper.Initialize(oodle);

var provider = new DefaultFileProvider(paks, SearchOption.TopDirectoryOnly, new VersionContainer(game));
provider.Initialize();
provider.SubmitKey(new FGuid(), new FAesKey(new byte[32]));
provider.PostMount();
// No real mappings exist: an empty set lets packages open so we can read their
// name/import/export tables and raw export bytes.
provider.MappingsContainer = new EmptyMappings();

switch (cmd)
{
    case "list":
        foreach (var f in provider.Files.Keys.OrderBy(k => k)) Console.WriteLine(f);
        break;
    case "batch":
        // batch <game> <listfile>: each line "<package>	<outdir>"
        foreach (var line in File.ReadAllLines(args[2]).Where(l => l.Contains('	')))
        {
            var parts = line.Split('	');
            try { DumpExports(parts[0], parts[1]); }
            catch (Exception ex) { Console.WriteLine($"FAIL {parts[0]}: {ex.Message}"); }
        }
        break;
    case "exports":
        DumpExports(args[2], args[3]);
        break;
    case "raw":
        // raw <game> <path> <outfile>
        File.WriteAllBytes(args[3], provider.SaveAsset(args[2]));
        break;
    case "batchraw":
        // batchraw <game> <listfile>: each line "<file>\t<outfile>"; missing files are skipped
        foreach (var line in File.ReadAllLines(args[2]).Where(l => l.Contains('\t')))
        {
            var parts = line.Split('\t');
            if (!provider.Files.ContainsKey(parts[0])) continue;
            Directory.CreateDirectory(Path.GetDirectoryName(Path.GetFullPath(parts[1]))!);
            File.WriteAllBytes(parts[1], provider.SaveAsset(parts[0]));
        }
        break;
    case "locres":
        // locres <game> <path> <outfile.json>
    {
        var bytes = provider.SaveAsset(args[2]);
        var res = new CUE4Parse.UE4.Localization.FTextLocalizationResource(new CUE4Parse.UE4.Readers.FByteArchive(args[2], bytes));
        File.WriteAllText(args[3], Newtonsoft.Json.JsonConvert.SerializeObject(res, Newtonsoft.Json.Formatting.Indented));
        break;
    }
}

void DumpExports(string path, string outDir)
    {
        Directory.CreateDirectory(outDir);
        var pkg = (IoPackage) provider.LoadPackage(path);
        var raw = provider.SaveAsset(provider.FixPath(path) is { } p && provider.Files.ContainsKey(p) ? p : path);
        var realm = typeof(IoPackage).GetField("BaseRealm", BindingFlags.NonPublic | BindingFlags.Instance)?.GetValue(pkg)
            ?? typeof(IoPackage).GetProperty("BaseRealm", BindingFlags.NonPublic | BindingFlags.Instance)!.GetValue(pkg);
        var baseOffset = (int) realm!.GetType().GetField("AllExportDataOffset")!.GetValue(realm)!;
        using var tsv = new StreamWriter(Path.Combine(outDir, "exports.tsv"));
        tsv.WriteLine("idx\tname\tclass\tclassOuter\touter\toffset\tsize");
        for (var i = 0; i < pkg.ExportMap.Length; i++)
        {
            var e = pkg.ExportMap[i];
            var name = pkg.CreateFNameFromMappedName(e.ObjectName).Text;
            var cls = pkg.ResolveObjectIndex(e.ClassIndex);
            var outer = pkg.ResolveObjectIndex(e.OuterIndex);
            var off = baseOffset + (long) e.CookedSerialOffset;
            tsv.WriteLine($"{i}\t{name}\t{cls?.Name.Text}\t{cls?.Outer?.Name.Text}\t{outer?.Name.Text}\t{off}\t{e.CookedSerialSize}");
            var len = (int) Math.Min((long) e.CookedSerialSize, raw.Length - off);
            if (len > 0) File.WriteAllBytes(Path.Combine(outDir, $"{i}.bin"), raw.AsSpan((int) off, len).ToArray());
        }
        using (var imports = new StreamWriter(Path.Combine(outDir, "imports.tsv")))
        {
            for (var i = 0; i < pkg.ImportMap.Length; i++)
            {
                var r = pkg.ResolveObjectIndex(pkg.ImportMap[i]);
                imports.WriteLine($"{i}	{r?.GetPathName()}");
            }
        }
        using var names = new StreamWriter(Path.Combine(outDir, "names.txt"));
        foreach (var n in pkg.NameMap) names.WriteLine(n.Name);
        Console.WriteLine($"{path}: {pkg.ExportMap.Length} exports");
    }

class EmptyMappings : ITypeMappingsProvider
{
    public TypeMappings? MappingsForGame { get; } = new();
    public void Load(string path, StringComparer? comparer = null) { }
    public void Load(byte[] bytes, StringComparer? comparer = null) { }
    public void Reload() { }
}
