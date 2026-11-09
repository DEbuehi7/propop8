# AIM-B5R weathering layer (proposed, 8 Nov 2026)

Status: **canon B5R-55, PROPOSED in canon 1.11.0.** The calculator is built
(`lib/b5r/weathering/serviceLife.ts`, tested in `tests/b5rWeathering.test.ts`).
There are no records, no screen and no photo store yet, and no real lifespan
or factor value ships with it.

The owner asked for it after walking downtown and seeing buildings and streets
go through cycles: paint fading, graffiti on signs, chipped crosswalk markings,
trash, signs with dead bulbs, cracked and uneven concrete. AIM-B5R already
dealt with time as money and dates (the investment cycle B5R-01, the capture
clock, ChronoLens VIS-10, façade lifecycle value B5R-43, the infrastructure
register's service-life column INF-02). It had no model of how a material's
condition changes. This is that model.

## What gets tracked

Each element names its **shearing layer**. Stewart Brand's six layers
(*How Buildings Learn*, 1994, after Frank Duffy) age at different speeds:

| Layer | What it is | How fast it changes (Brand's rough figures, not inputs) |
|---|---|---|
| site | The ground, the lot, the street | Effectively permanent |
| structure | Foundation and frame | 30 to 300 years |
| skin | Exterior surfaces and finishes | About 20 years |
| services | Wiring, plumbing, lighting, signs, HVAC | 7 to 15 years |
| space_plan | Interior layout | 3 to 30 years |
| stuff | Furniture and fittings | Daily to monthly |

Almost everything on the owner's list lives in the fast layers (skin, services)
and the street, while the structure behind it is often sound. Neglected fast
layers on a sound slow layer are the adaptive-reuse opportunity B5R-37 asks to
measure before deciding anything.

Each element also says **who can fix it** (`building`, `public` or `unknown`;
a crosswalk is the city's) and **how it wears**:

| Mechanism | Kind | What happens | Seen downtown as |
|---|---|---|---|
| `uv` | material | Sunlight breaks down the binder and pigment, so paint fades and chalks | Faded paint |
| `abrasion` | material | Feet, tyres and cleaning wear the surface away | Chipped crosswalk markings |
| `thermal` | material | Heating and cooling cycles crack and loosen materials | Cracked finishes |
| `moisture` | material | Water gets in: staining, efflorescence, rot, failed sealant | Streaks and white bloom on walls |
| `corrosion` | material | Steel and fixings rust | Rust stains, loose fixings |
| `root_heave` | material | Tree roots lift and crack slabs | Uneven sidewalks |
| `cracking` | material | Shrinkage and settlement crack concrete and plaster | Cracked concrete |
| `carbonation` | material | Carbonation reaches the rebar, which rusts and splits the concrete | Spalling over decades |
| `lamp_failure` | material | Lamps burn out; LEDs dim slowly instead | Signs missing bulbs |
| `graffiti` | social | People mark it | Tags on signs |
| `vandalism` | social | People break it | Broken fixtures |
| `litter` | operational | Trash collects until it is picked up | Trash in the street |

Social and operational kinds are **cycles, not decay**. They get no service
life; `responseTimes()` reports the median hours from report to clear, how many
are open and how long the oldest has waited.

The causes depend on the place (INF-04). Freeze-thaw, a big driver in cold
cities, barely matters in Los Angeles; sun, heat, roots and traffic do.

## Estimated service life

The factor method of ISO 15686 (part 8, reference service life and
service-life estimation):

```
estimated life = reference service life
               x quality x design x execution x indoor x outdoor x in-use x maintenance
```

- The **reference service life** is a sourced number of years under stated
  reference conditions: a product declaration, a standard or a published study.
  It needs its source.
- Each of the seven **factors** is a multiplier with a written basis. The
  standard suggests 0.8 (worse than reference), 1.0 (reference) or 1.2
  (better). Values outside 0.8 to 1.2 are allowed but flagged for a person.
  (Papers differ on which letter, D or E, is the indoor or outdoor factor; the
  code uses names, and the product is the same.)
- **Unknown stays unknown.** A missing reference life, source, factor value or
  basis leaves the estimate unknown and lists what is missing. No default
  lifespan or factor exists anywhere in the code (GOV-17).
- A year is 365.25 days, and dates are whole days in UTC.

When a façade module's product is chosen, its declared lifespan
(`lifespanYears` in the façade catalogue, unknown today) is the natural
reference service life.

## Condition grades

| Grade | Meaning |
|---|---|
| 1 | As new |
| 2 | Minor wear, nothing to do |
| 3 | Visible wear, still works |
| 4 | Poor: needs work |
| 5 | Failed or unsafe |

A grade counts only when it has a valid date, a named grader, a photo
reference and a **registered viewpoint**, so photos taken months apart compare
like with like (capture clock; ChronoCompare in VIS-10 needs date-registered,
spatially registered sources). Photos dated after the day being assessed are
left out. The code never grades a photo: a person does (GOV-14).

## When work falls due

`assess(element, day)` returns one of five statuses:

1. **due (observed):** the latest grade is at or past the element's
   intervention grade (4 unless set). The due date is the first look of that
   run.
2. Otherwise the next date is the **earlier** of
   - the **trend**: a least-squares line through the graded looks, which
     needs two looks at least 90 days apart and only projects a date when the
     grade is getting worse; and
   - the **age estimate**: install date plus estimated life.
3. **ok:** that date is still ahead.
4. **check:** the date has passed but a look on or after it graded below the
   intervention grade. A person re-inspects and, if it holds, changes the
   reference life or a factor. The software never moves a date later on its
   own; a slower trend than the age estimate is noted, not obeyed.
5. **due:** the date has passed and nobody has looked since.

**unknown** means no estimate, no install date and no usable trend; the notes
say which. **not_decay** is the answer for social and operational kinds.

The intervention grade (4), the 90-day trend minimum and the 0.8 to 1.2 flag
are tuning constants in the code, not canon.

## How it connects

- **Recalibrate (B5R-01):** actual repair dates and grades are what correct
  reference lives and factors for the next building.
- **Façade lifecycle value (B5R-42, B5R-43):** it counts 0 until a benefit is
  verified. Measured avoided maintenance from this layer is how it gets
  verified.
- **Infrastructure register (INF-02):** its service-life column can cite the
  estimate and its inputs.
- **Measured outcomes (B5R-49):** grades and response times are building
  measures, kept apart from resident and value measures.

## Guardrails

- Wear describes materials and streets, never the people who live there.
  Visible wear is never a proxy for residents, eligibility or a tenant score
  (GOV-29, B5R-54).
- Downtown Los Angeles stays desk research and public-street photos only
  (B5R-51); no current or former employer's building, residents or imagery
  (GOV-16).
- Every value in the tests is synthetic and labelled so (GOV-17).

## Not built yet

A records table, a photo store with registered viewpoints, a screen, and
reference lives with real sources. Each waits for a pilot building (Fresno
first, B5R-45, B5R-51) and the owner's lock of B5R-55.
