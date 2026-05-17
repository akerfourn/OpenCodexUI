const fs = require("node:fs");
const path = require("node:path");

const ResEdit = require("resedit");

module.exports = async function afterPack(context) {
  if (context.electronPlatformName !== "win32") {
    return;
  }

  const productFilename = context.packager.appInfo.productFilename;
  const executablePath = path.join(context.appOutDir, `${productFilename}.exe`);
  const iconPath = path.join(context.packager.projectDir, "build", "icon.ico");

  replaceExecutableIcon(executablePath, iconPath);
};

function replaceExecutableIcon(executablePath, iconPath) {
  const executable = ResEdit.NtExecutable.from(fs.readFileSync(executablePath));
  const resources = ResEdit.NtExecutableResource.from(executable);
  const iconFile = ResEdit.Data.IconFile.from(fs.readFileSync(iconPath));
  const iconGroups = ResEdit.Resource.IconGroupEntry.fromEntries(resources.entries);
  const iconItems = iconFile.icons.map((item) => item.data);

  if (iconGroups.length === 0) {
    ResEdit.Resource.IconGroupEntry.replaceIconsForResource(resources.entries, 1, 0x409, iconItems);
  } else {
    for (const iconGroup of iconGroups) {
      ResEdit.Resource.IconGroupEntry.replaceIconsForResource(
        resources.entries,
        iconGroup.id,
        iconGroup.lang,
        iconItems
      );
    }
  }

  resources.outputResource(executable);
  fs.writeFileSync(executablePath, Buffer.from(executable.generate()));
}
