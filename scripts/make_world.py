#!/usr/bin/env python3
"""Build frontend/public/world.geojson: an offline world basemap (land + lakes + country labels).

Source: Natural Earth 1:50m admin_0 countries and lakes (public domain).
    python scripts/make_world.py --countries ne_50m_admin_0_countries.shp --lakes ne_50m_lakes.shp
Needs pyshp and shapely (both in the project venv).
"""
import argparse, json
from pathlib import Path
import shapefile
from shapely.geometry import shape, mapping

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'frontend' / 'public' / 'world.geojson'

# Mongolian names for the countries that get a label at low zoom. Everything else falls back to the English name.
MN = {
    'Mongolia': 'Монгол', 'China': 'Хятад', 'Russia': 'Орос', 'Kazakhstan': 'Казахстан', 'Japan': 'Япон', 'South Korea': 'Өмнөд Солонгос',
    'North Korea': 'Хойд Солонгос', 'India': 'Энэтхэг', 'Pakistan': 'Пакистан', 'Afghanistan': 'Афганистан', 'Iran': 'Иран', 'Turkey': 'Турк',
    'Kyrgyzstan': 'Киргиз', 'Uzbekistan': 'Узбекистан', 'Tajikistan': 'Тажикистан', 'Turkmenistan': 'Туркменистан', 'Vietnam': 'Вьетнам',
    'Thailand': 'Тайланд', 'Myanmar': 'Мьянмар', 'Indonesia': 'Индонез', 'Philippines': 'Филиппин', 'Malaysia': 'Малайз', 'Australia': 'Австрали',
    'United States of America': 'АНУ', 'Canada': 'Канад', 'Mexico': 'Мексик', 'Brazil': 'Бразил', 'Argentina': 'Аргентин', 'Germany': 'Герман',
    'France': 'Франц', 'United Kingdom': 'Их Британи', 'Spain': 'Испани', 'Italy': 'Итали', 'Poland': 'Польш', 'Ukraine': 'Украин', 'Egypt': 'Египет',
    'Saudi Arabia': 'Саудын Араб', 'South Africa': 'Өмнөд Африк', 'Nigeria': 'Нигери', 'Ethiopia': 'Этиоп', 'Algeria': 'Алжир', 'Sudan': 'Судан',
    'Libya': 'Ливи', 'Greenland': 'Гренланд', 'Iraq': 'Ирак', 'Nepal': 'Балба', 'Bangladesh': 'Бангладеш', 'Sweden': 'Швед', 'Norway': 'Норвеги',
    'Finland': 'Финланд', 'Peru': 'Перу', 'Colombia': 'Колумб', 'Chile': 'Чили', 'Venezuela': 'Венесуэл', 'Taiwan': 'Тайвань', 'Laos': 'Лаос',
    'Cambodia': 'Камбож', 'Bhutan': 'Бутан', 'Sri Lanka': 'Шри Ланка', 'Belarus': 'Беларусь', 'Romania': 'Румын', 'Georgia': 'Гүрж',
    'Azerbaijan': 'Азербайжан', 'Armenia': 'Армен', 'Syria': 'Сири', 'Israel': 'Израиль', 'Mali': 'Мали', 'Niger': 'Нигер', 'Chad': 'Чад',
    'Angola': 'Ангол', 'Dem. Rep. Congo': 'Конго', 'Tanzania': 'Танзани', 'Kenya': 'Кени', 'Somalia': 'Сомали', 'Madagascar': 'Мадагаскар',
    'Mozambique': 'Мозамбик', 'Zambia': 'Замби', 'Namibia': 'Намиби', 'Botswana': 'Ботсвана', 'Morocco': 'Марокко', 'Mauritania': 'Мавритани',
    'Iceland': 'Исланд', 'Ireland': 'Ирланд', 'Portugal': 'Португал', 'Greece': 'Грек', 'Bolivia': 'Боливи', 'Paraguay': 'Парагвай', 'Uruguay': 'Уругвай',
    'Cuba': 'Куба', 'New Zealand': 'Шинэ Зеланд', 'Papua New Guinea': 'Папуа Шинэ Гвиней', 'Oman': 'Оман', 'Yemen': 'Йемен',
}


def rnd(geom, digits=3):
    return json.loads(json.dumps(mapping(geom)), parse_float=lambda s: round(float(s), digits))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--countries', required=True)
    ap.add_argument('--lakes', required=True)
    ap.add_argument('--tolerance', type=float, default=0.04, help='simplify tolerance in degrees')
    args = ap.parse_args()

    features, labels = [], []
    for rec in shapefile.Reader(args.countries).iterShapeRecords():
        p = rec.record.as_dict()
        geom = shape(rec.shape.__geo_interface__).simplify(args.tolerance, preserve_topology=True).buffer(0)
        if geom.is_empty:
            continue
        name = p.get('NAME') or ''
        features.append({'type': 'Feature', 'properties': {'k': 'land', 'a': p.get('ISO_A2'), 'n': MN.get(name, name)}, 'geometry': rnd(geom)})
        # Natural Earth ships a hand-placed label point per country and the zoom level at which its name should appear.
        if p.get('LABEL_X') is not None and name:
            labels.append({'n': MN.get(name, name), 'c': [round(p['LABEL_X'], 2), round(p['LABEL_Y'], 2)], 's': float(p.get('MIN_LABEL') or 5), 'a': p.get('ISO_A2')})

    for rec in shapefile.Reader(args.lakes).iterShapeRecords():
        p = rec.record.as_dict()
        if int(p.get('scalerank') or 9) > 2:   # only the big lakes read at world/continent zoom
            continue
        geom = shape(rec.shape.__geo_interface__).simplify(args.tolerance / 2, preserve_topology=True)
        if geom.is_empty:
            continue
        features.append({'type': 'Feature', 'properties': {'k': 'lake', 'n': p.get('name') or ''}, 'geometry': rnd(geom)})

    out = {'type': 'FeatureCollection', 'features': features, 'labels': sorted(labels, key=lambda l: l['s'])}
    OUT.write_text(json.dumps(out, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    print(f'{OUT}: {len(features)} features, {len(labels)} labels, {OUT.stat().st_size / 1024:.0f} KB')


if __name__ == '__main__':
    main()
