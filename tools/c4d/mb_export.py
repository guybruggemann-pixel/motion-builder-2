"""Motion Builder 2.0 - Cinema 4D asset dumper - v0.1 (untested in C4D: check the first runs).

Writes the raw data of the active document to c4d.json for the app's importer:
objects (hierarchy, type, transforms, user-facing parameters), material assignments with the
basic physical values, cameras, lights, and every animation track with keys and tangents.
No conversion happens here: values are written as Cinema 4D reports them (rotation HPB in
radians, C4D's Y-up left-handed space, centimetres).

Use: set OUT_FOLDER (or leave it empty to save next to the .c4d file), then run it from
Extensions > Script Manager, or through the C4D MCP's Python execution.
"""
import json
import math
import os

import c4d

OUT_FOLDER = ""  # absolute folder path; "" = next to the document
VERSION = "mb-c4d-dump/0.1"
MAX_DEPTH = 32


def vec(v):
    return [v.x, v.y, v.z]


def clean(value):
    """Turn C4D values into JSON-safe values; None when the type isn't useful."""
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return value if (not isinstance(value, float) or math.isfinite(value)) else None
    if isinstance(value, str):
        return value
    if isinstance(value, c4d.Vector):
        return vec(value)
    if isinstance(value, c4d.Matrix):
        return {"off": vec(value.off), "v1": vec(value.v1), "v2": vec(value.v2), "v3": vec(value.v3)}
    if isinstance(value, c4d.BaseTime):
        return value.Get()
    if isinstance(value, c4d.BaseList2D):
        return {"link": value.GetName(), "type": value.GetTypeName()}
    if isinstance(value, c4d.FontData):
        bc = value.GetFont()
        return {"font": bc.GetString(500) or bc.GetString(501) or "", "raw": True}
    return None


def params(node):
    """User-visible parameters from the node's description (numbers, vectors, bools, strings, links)."""
    out = {}
    try:
        desc = node.GetDescription(c4d.DESCFLAGS_DESC_NONE)
    except Exception:
        return out
    for bc, paramid, _group in desc:
        try:
            name = bc[c4d.DESC_NAME] or bc[c4d.DESC_IDENT]
            if not name or len(paramid) == 0:
                continue
            dtype = paramid[0].dtype
            if dtype in (c4d.DTYPE_GROUP, c4d.DTYPE_SEPARATOR, c4d.DTYPE_BUTTON, c4d.DTYPE_POPUP):
                continue
            value = clean(node[paramid])
            if value is None:
                continue
            key = "%s#%d" % (name, paramid[0].id)
            out[key] = value
        except Exception:
            continue
    return out


INTERP = {c4d.CINTERPOLATION_LINEAR: "linear", c4d.CINTERPOLATION_STEP: "step", c4d.CINTERPOLATION_SPLINE: "spline"}


def tracks(node, fps):
    out = []
    for track in node.GetCTracks():
        curve = track.GetCurve()
        if curve is None:
            continue
        did = track.GetDescriptionID()
        entry = {
            "name": track.GetName(),
            "id": [did[i].id for i in range(len(did))],
            "keys": [],
        }
        for i in range(curve.GetKeyCount()):
            key = curve.GetKey(i)
            k = {
                "t": key.GetTime().Get(),
                "frame": key.GetTime().GetFrame(fps),
                "v": key.GetValue(),
                "interp": INTERP.get(key.GetInterpolation(), str(key.GetInterpolation())),
                "tl": key.GetTimeLeft().Get(),
                "vl": key.GetValueLeft(),
                "tr": key.GetTimeRight().Get(),
                "vr": key.GetValueRight(),
            }
            try:
                k["easeIn"] = key.GetEaseIn() if hasattr(key, "GetEaseIn") else None
            except Exception:
                pass
            entry["keys"].append(k)
        if entry["keys"]:
            out.append(entry)
    return out


def materials_of(obj):
    out = []
    for tag in obj.GetTags():
        if tag.CheckType(c4d.Ttexture):
            mat = tag[c4d.TEXTURETAG_MATERIAL]
            if mat:
                out.append({"material": mat.GetName(), "projection": tag[c4d.TEXTURETAG_PROJECTION]})
    return out


def dump_material(mat, fps):
    m = {"name": mat.GetName(), "type": mat.GetTypeName(), "params": params(mat), "tracks": tracks(mat, fps)}
    if mat.CheckType(c4d.Mmaterial):
        try:
            m["basic"] = {
                "color": vec(mat[c4d.MATERIAL_COLOR_COLOR]) if mat[c4d.MATERIAL_USE_COLOR] else None,
                "luminance": vec(mat[c4d.MATERIAL_LUMINANCE_COLOR]) if mat[c4d.MATERIAL_USE_LUMINANCE] else None,
                "transparency": mat[c4d.MATERIAL_TRANSPARENCY_BRIGHTNESS] if mat[c4d.MATERIAL_USE_TRANSPARENCY] else 0,
            }
        except Exception:
            pass
    # Node materials (Redshift, standard node space): left to the importer via params; a
    # human may need to fill base colour / roughness / metalness in asset.json importNotes.
    return m


def dump_object(obj, fps, depth=0):
    o = {
        "name": obj.GetName(),
        "type": obj.GetTypeName(),
        "typeId": obj.GetType(),
        "pos": vec(obj.GetRelPos()),
        "rot": vec(obj.GetRelRot()),  # HPB, radians
        "scale": vec(obj.GetRelScale()),
        "editorVisible": obj.GetEditorMode(),
        "renderVisible": obj.GetRenderMode(),
        "params": params(obj),
        "materials": materials_of(obj),
        "tracks": tracks(obj, fps),
        "children": [],
    }
    if depth < MAX_DEPTH:
        child = obj.GetDown()
        while child:
            o["children"].append(dump_object(child, fps, depth + 1))
            child = child.GetNext()
    return o


def main():
    doc = c4d.documents.GetActiveDocument()
    fps = doc.GetFps()
    objects = []
    obj = doc.GetFirstObject()
    while obj:
        objects.append(dump_object(obj, fps))
        obj = obj.GetNext()
    mats = []
    mat = doc.GetFirstMaterial()
    while mat:
        mats.append(dump_material(mat, fps))
        mat = mat.GetNext()
    rd = doc.GetActiveRenderData()
    bd = doc.GetActiveBaseDraw()
    active_cam = bd.GetSceneCamera(doc) if bd else None

    data = {
        "format": VERSION,
        "document": doc.GetDocumentName(),
        "path": doc.GetDocumentPath(),
        "fps": fps,
        "minTime": doc.GetMinTime().Get(),
        "maxTime": doc.GetMaxTime().Get(),
        "render": {"width": rd[c4d.RDATA_XRES], "height": rd[c4d.RDATA_YRES], "fps": rd[c4d.RDATA_FRAMERATE]},
        "activeCamera": active_cam.GetName() if active_cam else None,
        "upAxis": "Y",
        "handedness": "left",
        "units": "cm",
        "objects": objects,
        "materials": mats,
    }
    folder = OUT_FOLDER or doc.GetDocumentPath() or os.path.expanduser("~/Desktop")
    if not os.path.isdir(folder):
        os.makedirs(folder)
    path = os.path.join(folder, "c4d.json")
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=1, default=lambda v: None)
    print("mb_export: wrote %s (%d top-level objects, %d materials)" % (path, len(objects), len(mats)))


if __name__ == "__main__":
    main()
