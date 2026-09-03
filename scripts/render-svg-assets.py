from ctypes import CDLL, POINTER, c_char_p, c_double, c_int, c_void_p, byref
from pathlib import Path
import re, sys

rsvg=CDLL("librsvg-2.so.2")
cairo=CDLL("libcairo.so.2")
gobject=CDLL("libgobject-2.0.so.0")
rsvg.rsvg_handle_new_from_file.argtypes=[c_char_p,POINTER(c_void_p)]
rsvg.rsvg_handle_new_from_file.restype=c_void_p
rsvg.rsvg_handle_render_cairo.argtypes=[c_void_p,c_void_p]
rsvg.rsvg_handle_render_cairo.restype=c_int
cairo.cairo_image_surface_create.argtypes=[c_int,c_int,c_int]
cairo.cairo_image_surface_create.restype=c_void_p
cairo.cairo_create.argtypes=[c_void_p]
cairo.cairo_create.restype=c_void_p
cairo.cairo_surface_write_to_png.argtypes=[c_void_p,c_char_p]
cairo.cairo_surface_write_to_png.restype=c_int
cairo.cairo_destroy.argtypes=[c_void_p]
cairo.cairo_surface_destroy.argtypes=[c_void_p]
gobject.g_object_unref.argtypes=[c_void_p]

for value in sys.argv[1:]:
    source=Path(value)
    markup=source.read_text(encoding="utf-8")
    width=int(re.search(r'width="(\d+)"',markup).group(1))
    height=int(re.search(r'height="(\d+)"',markup).group(1))
    failure=c_void_p()
    handle=rsvg.rsvg_handle_new_from_file(str(source).encode(),byref(failure))
    if not handle: raise RuntimeError(f"Could not parse {source}")
    surface=cairo.cairo_image_surface_create(0,width,height)
    context=cairo.cairo_create(surface)
    if not rsvg.rsvg_handle_render_cairo(handle,context): raise RuntimeError(f"Could not render {source}")
    target=source.with_suffix(".png")
    if cairo.cairo_surface_write_to_png(surface,str(target).encode()): raise RuntimeError(f"Could not write {target}")
    cairo.cairo_destroy(context);cairo.cairo_surface_destroy(surface);gobject.g_object_unref(handle)
    print(target)
