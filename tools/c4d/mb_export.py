"""Motion Builder 2.0 - Cinema 4D asset dumper - v0.2 (untested in C4D: check the first runs).

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
VERSION = "mb-c4d-dump/0.2"
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
            "channel": channel_of(did),
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


def const(name, fallback=None):
    """A c4d constant by name, so a missing one in this C4D version doesn't stop the export."""
    return getattr(c4d, name, fallback)


def read(node, name):
    """node[c4d.<name>] as a JSON-safe value, or None when this version doesn't have it."""
    pid = const(name)
    if pid is None:
        return None
    try:
        return clean(node[pid])
    except Exception:
        return None


def matrix(m):
    return {"off": vec(m.off), "v1": vec(m.v1), "v2": vec(m.v2), "v3": vec(m.v3)}


# Object kinds the importer knows, resolved here so the importer never guesses type ids.
KINDS = [
    ("null", "Onull", 5140), ("cube", "Ocube", 5159), ("sphere", "Osphere", 5160), ("extrude", "Oextrude", 5116),
    ("rect-spline", "Osplinerectangle", 5186), ("circle-spline", "Osplinecircle", 5181), ("text-spline", "Osplinetext", 5178),
    ("camera", "Ocamera", 5103), ("light", "Olight", 5102), ("cloner", "Omgcloner", 1018544), ("motext", "Omgtext", 1019268),
]


def kind_of(obj):
    for kind, name, fallback in KINDS:
        try:
            if obj.CheckType(const(name, fallback)):
                return kind
        except Exception:
            pass
    return "other"


def word(value, names):
    """An enum value as a word: names is [(constant name, word)]; unknown values stay numbers."""
    for cname, w in names:
        if const(cname) is not None and value == const(cname):
            return w
    return value


def font_of(node, name):
    try:
        bc = node[const(name)].GetFont()
        return {"family": bc.GetString(500), "name": bc.GetString(501), "postscript": bc.GetString(509)}
    except Exception:
        return None


def known(obj, kind):
    """The few parameters the importer needs, read through C4D's own constants."""
    k = {}
    if kind == "cube":
        k = {"size": read(obj, "PRIM_CUBE_LEN"), "fillet": read(obj, "PRIM_CUBE_DOFILLET"), "filletRadius": read(obj, "PRIM_CUBE_FRAD")}
    elif kind == "extrude":
        k = {"offset": read(obj, "EXTRUDEOBJECT_EXTRUSIONOFFSET"), "move": read(obj, "EXTRUDEOBJECT_MOVE")}
    elif kind == "rect-spline":
        k = {"width": read(obj, "PRIM_RECTANGLE_WIDTH"), "height": read(obj, "PRIM_RECTANGLE_HEIGHT"), "rounding": read(obj, "PRIM_RECTANGLE_ROUNDING"), "radius": read(obj, "PRIM_RECTANGLE_RADIUS")}
    elif kind == "circle-spline":
        k = {"radius": read(obj, "PRIM_CIRCLE_RADIUS"), "ellipse": read(obj, "PRIM_CIRCLE_ELLIPSE"), "radiusY": read(obj, "PRIM_CIRCLE_RADIUSY")}
    elif kind == "text-spline":
        k = {"text": read(obj, "PRIM_TEXT_TEXT"), "height": read(obj, "PRIM_TEXT_HEIGHT"), "font": font_of(obj, "PRIM_TEXT_FONT"),
             "align": word(read(obj, "PRIM_TEXT_ALIGN"), [("PRIM_TEXT_ALIGN_LEFT", "left"), ("PRIM_TEXT_ALIGN_MIDDLE", "center"), ("PRIM_TEXT_ALIGN_RIGHT", "right")])}
    elif kind == "motext":
        k = {"text": read(obj, "MGTEXTOBJECT_TEXT"), "height": read(obj, "MGTEXTOBJECT_HEIGHT"), "font": font_of(obj, "MGTEXTOBJECT_FONT"),
             "depth": read(obj, "MGTEXTOBJECT_DEPTH"), "move": read(obj, "MGTEXTOBJECT_SPLINEMOVE"),
             "align": word(read(obj, "MGTEXTOBJECT_ALIGN"), [("MGTEXTOBJECT_ALIGN_LEFT", "left"), ("MGTEXTOBJECT_ALIGN_MIDDLE", "center"), ("MGTEXTOBJECT_ALIGN_RIGHT", "right")])}
    elif kind == "cloner":
        k = {"mode": word(read(obj, "ID_MG_MOTIONGENERATOR_MODE"), [("ID_MG_CLONE_MODE_LINEAR", "linear"), ("ID_MG_CLONE_MODE_RADIAL", "radial"), ("ID_MG_CLONE_MODE_GRID", "grid"), ("ID_MG_CLONE_MODE_OBJECT", "object"), ("ID_MG_CLONE_MODE_HONEYCOMB", "honeycomb")]),
             "linearCount": read(obj, "MG_LINEAR_COUNT"), "linearStep": read(obj, "MG_LINEAR_OBJECT_POSITION"), "linearRotation": read(obj, "MG_LINEAR_OBJECT_ROTATION"),
             "radialCount": read(obj, "MG_POLY_COUNT"), "radialRadius": read(obj, "MG_POLY_RADIUS"),
             "radialPlane": word(read(obj, "MG_POLY_PLANE"), [("MG_POLY_PLANE_XY", "xy"), ("MG_POLY_PLANE_ZY", "zy"), ("MG_POLY_PLANE_XZ", "xz")]),
             "gridCount": read(obj, "MG_GRID_RESOLUTION"), "gridSize": read(obj, "MG_GRID_SIZE"),
             "gridMode": word(read(obj, "MG_GRID_MODE"), [("MG_GRID_MODE_PERSTEP", "per-step"), ("MG_GRID_MODE_ENDPOINT", "endpoint")])}
    elif kind == "camera":
        k = {"focalLength": read(obj, "CAMERA_FOCUS"), "aperture": read(obj, "CAMERAOBJECT_APERTURE")}
    elif kind == "light":
        k = {"type": word(read(obj, "LIGHT_TYPE"), [("LIGHT_TYPE_OMNI", "point"), ("LIGHT_TYPE_SPOT", "spot"), ("LIGHT_TYPE_DISTANT", "directional"), ("LIGHT_TYPE_PARALLEL", "directional"), ("LIGHT_TYPE_AREA", "area")]),
             "color": read(obj, "LIGHT_COLOR"), "brightness": read(obj, "LIGHT_BRIGHTNESS"), "outerAngle": read(obj, "LIGHT_DETAILS_OUTERANGLE"),
             "shadow": word(read(obj, "LIGHT_SHADOWTYPE"), [("LIGHT_SHADOWTYPE_NONE", "none")])}
    return dict((key, value) for key, value in k.items() if value is not None)


# Transform tracks by name ("position.x", "rotation.h", "scale.z"), so the importer never guesses ids.
def channel_of(did):
    try:
        groups = [("ID_BASEOBJECT_REL_POSITION", "position", "xyz"), ("ID_BASEOBJECT_REL_ROTATION", "rotation", "hpb"), ("ID_BASEOBJECT_REL_SCALE", "scale", "xyz")]
        axes = [const("VECTOR_X"), const("VECTOR_Y"), const("VECTOR_Z")]
        for cname, label, letters in groups:
            if len(did) == 2 and did[0].id == const(cname) and did[1].id in axes:
                return "%s.%s" % (label, letters[axes.index(did[1].id)])
    except Exception:
        pass
    return None


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
    m["known"] = dict((key, value) for key, value in {
        "color": read(mat, "MATERIAL_COLOR_COLOR") if read(mat, "MATERIAL_USE_COLOR") else None,
        "luminance": read(mat, "MATERIAL_LUMINANCE_COLOR") if read(mat, "MATERIAL_USE_LUMINANCE") else None,
        "transparency": read(mat, "MATERIAL_TRANSPARENCY_BRIGHTNESS") if read(mat, "MATERIAL_USE_TRANSPARENCY") else None,
        "reflection": read(mat, "MATERIAL_USE_REFLECTION"),
    }.items() if value is not None) if mat.CheckType(c4d.Mmaterial) else {}
    # Node materials (Redshift, standard node space): left to the importer via params; a
    # human may need to fill base colour / roughness / metalness in asset.json importNotes.
    return m


def dump_object(obj, fps, depth=0):
    kind = kind_of(obj)
    o = {
        "name": obj.GetName(),
        "kind": kind,
        "known": known(obj, kind),
        "ml": matrix(obj.GetMl()),  # local matrix: exact, whatever the rotation order
        "mg": matrix(obj.GetMg()),  # global matrix
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
        "scene": doc.GetDocumentName(),
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
