"use client";

import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock,
  Edit3,
  Plus,
  Printer,
  Trash2,
} from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";

type ScheduleEvent = {
  id: string;
  title: string;
  description: string;
  day: number;
  endDay: number;
  startMinute: number;
  endMinute: number;
  color: string;
};

type SelectionStart = {
  day: number;
  minute: number;
};

type ViewMode = "week" | "month";

type StoredWeekEvent = {
  event: ScheduleEvent;
  weekStart: Date;
};

const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const colorOptions = ["#ad2e61", "#c85f8b", "#8e4764", "#b86f8d", "#744052"];
const legacyColors: Record<string, string> = {
  "#8f6668": colorOptions[0],
  "#5f6f74": colorOptions[1],
  "#7b6b52": colorOptions[2],
  "#775f7a": colorOptions[3],
  "#6d765b": colorOptions[4],
};
const startHour = 0;
const endHour = 24;
const storagePrefix = "weekly-scheduler:";

function startOfWeek(date: Date) {
  const next = new Date(date);
  const day = (next.getDay() + 6) % 7;
  next.setDate(next.getDate() - day);
  next.setHours(0, 0, 0, 0);
  return next;
}

function addDays(date: Date, amount: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return next;
}

function toDateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function formatWeekRange(weekStart: Date) {
  const weekEnd = addDays(weekStart, 6);
  const sameMonth = weekStart.getMonth() === weekEnd.getMonth();
  const startMonth = weekStart.toLocaleDateString(undefined, { month: "long" });
  const endMonth = weekEnd.toLocaleDateString(undefined, { month: "long" });
  const year = weekEnd.getFullYear();

  if (sameMonth) {
    return `${startMonth} ${weekStart.getDate()} - ${weekEnd.getDate()}, ${year}`;
  }

  return `${startMonth} ${weekStart.getDate()} - ${endMonth} ${weekEnd.getDate()}, ${year}`;
}

function formatMonth(date: Date) {
  return date.toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

function formatDateLabel(date: Date) {
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function formatTime(minute: number) {
  const hour = Math.floor(minute / 60) % 24;
  const minutes = minute % 60;
  const period = hour >= 12 ? "PM" : "AM";
  const displayHour = hour % 12 || 12;
  return `${displayHour}:${minutes.toString().padStart(2, "0")} ${period}`;
}

function formatHour(minute: number) {
  const hour = Math.floor(minute / 60) % 24;
  const period = hour >= 12 ? "PM" : "AM";
  return `${hour % 12 || 12} ${period}`;
}

function parseTime(value: string) {
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

function timeValue(minute: number) {
  return `${Math.floor(minute / 60).toString().padStart(2, "0")}:${(minute % 60)
    .toString()
    .padStart(2, "0")}`;
}

function normalizeColor(color?: string) {
  if (!color) {
    return colorOptions[0];
  }

  return legacyColors[color.toLowerCase()] ?? color;
}

function defaultDraft(day?: number, startMinute?: number, endMinute?: number): ScheduleEvent {
  const selectedDay = day ?? (new Date().getDay() + 6) % 7;
  return {
    id: crypto.randomUUID(),
    title: "",
    description: "",
    day: selectedDay,
    endDay: selectedDay,
    startMinute: startMinute ?? 9 * 60,
    endMinute: endMinute ?? 10 * 60,
    color: colorOptions[0],
  };
}

function absoluteStart(event: ScheduleEvent) {
  return event.day * 1440 + event.startMinute;
}

function absoluteEnd(event: ScheduleEvent) {
  return event.endDay * 1440 + event.endMinute;
}

function eventSegments(event: ScheduleEvent) {
  if (event.endDay === event.day) {
    return [{ day: event.day, startMinute: event.startMinute, endMinute: event.endMinute }];
  }

  return [
    { day: event.day, startMinute: event.startMinute, endMinute: 1440 },
    { day: event.endDay, startMinute: 0, endMinute: event.endMinute },
  ].filter((segment) => segment.day < 7 && segment.endMinute > segment.startMinute);
}

export default function Home() {
  const [weekStart, setWeekStart] = useState<Date | null>(null);
  const [monthAnchor, setMonthAnchor] = useState<Date | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("week");
  const [events, setEvents] = useState<ScheduleEvent[]>([]);
  const [monthEvents, setMonthEvents] = useState<StoredWeekEvent[]>([]);
  const [draft, setDraft] = useState<ScheduleEvent | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selectionStart, setSelectionStart] = useState<SelectionStart | null>(null);
  const [isSelectingSlot, setIsSelectingSlot] = useState(false);
  const [formError, setFormError] = useState("");

  useEffect(() => {
    const today = new Date();
    setWeekStart(startOfWeek(today));
    setMonthAnchor(new Date(today.getFullYear(), today.getMonth(), 1));
  }, []);

  const storageKey = weekStart ? `${storagePrefix}${toDateKey(weekStart)}` : "";

  useEffect(() => {
    if (!storageKey) {
      return;
    }

    const saved = window.localStorage.getItem(storageKey);
    const parsedEvents = saved ? (JSON.parse(saved) as Partial<ScheduleEvent>[]) : [];
    setEvents(
      parsedEvents.map((event) => ({
        id: event.id ?? crypto.randomUUID(),
        title: event.title ?? "",
        description: event.description ?? "",
        day: event.day ?? 0,
        endDay: event.endDay ?? event.day ?? 0,
        startMinute: event.startMinute ?? 9 * 60,
        endMinute: event.endMinute ?? 10 * 60,
        color: normalizeColor(event.color),
      })),
    );
    setDraft(null);
    setEditingId(null);
    setSelectionStart(null);
    setIsSelectingSlot(false);
    setFormError("");
  }, [storageKey]);

  useEffect(() => {
    if (!storageKey) {
      return;
    }

    window.localStorage.setItem(storageKey, JSON.stringify(events));
  }, [events, storageKey]);

  const monthDates = useMemo(() => {
    if (!monthAnchor) {
      return [];
    }

    const gridStart = startOfWeek(new Date(monthAnchor.getFullYear(), monthAnchor.getMonth(), 1));
    return Array.from({ length: 42 }, (_, index) => addDays(gridStart, index));
  }, [monthAnchor]);

  useEffect(() => {
    if (viewMode !== "month" || !monthDates.length) {
      return;
    }

    const weekKeys = Array.from(
      new Map(
        monthDates.map((date) => {
          const start = startOfWeek(date);
          return [toDateKey(start), start] as const;
        }),
      ).values(),
    );

    const stored = weekKeys.flatMap((start) => {
      const saved = window.localStorage.getItem(`${storagePrefix}${toDateKey(start)}`);
      const parsed = saved ? (JSON.parse(saved) as Partial<ScheduleEvent>[]) : [];
      return parsed.map((event) => ({
        weekStart: start,
        event: {
          id: event.id ?? crypto.randomUUID(),
          title: event.title ?? "",
          description: event.description ?? "",
          day: event.day ?? 0,
          endDay: event.endDay ?? event.day ?? 0,
          startMinute: event.startMinute ?? 9 * 60,
          endMinute: event.endMinute ?? 10 * 60,
          color: normalizeColor(event.color),
        },
      }));
    });

    setMonthEvents(stored);
  }, [events, monthDates, viewMode]);

  const weekDates = useMemo(() => {
    if (!weekStart) {
      return [];
    }

    return days.map((_, index) => addDays(weekStart, index));
  }, [weekStart]);

  const sortedEvents = useMemo(
    () =>
      [...events].sort(
        (first, second) =>
          first.day - second.day || first.startMinute - second.startMinute,
      ),
    [events],
  );

  if (!weekStart || !monthAnchor) {
    return <main className="loading">Loading schedule...</main>;
  }

  function movePeriod(amount: number) {
    if (viewMode === "month") {
      setMonthAnchor(
        (current) => current && new Date(current.getFullYear(), current.getMonth() + amount, 1),
      );
      return;
    }

    setWeekStart((current) => (current ? addDays(current, amount * 7) : current));
  }

  function goToToday() {
    const today = new Date();
    setWeekStart(startOfWeek(today));
    setMonthAnchor(new Date(today.getFullYear(), today.getMonth(), 1));
  }

  function openDate(date: Date) {
    setWeekStart(startOfWeek(date));
    setViewMode("week");
    cancelCreate();
  }

  function beginCreate() {
    setViewMode("week");
    setEditingId(null);
    setDraft(null);
    setSelectionStart(null);
    setIsSelectingSlot(true);
    setFormError("");
  }

  function beginEdit(event: ScheduleEvent) {
    setEditingId(event.id);
    setDraft({ ...event });
    setSelectionStart(null);
    setIsSelectingSlot(false);
    setFormError("");
  }

  function deleteEvent(id: string) {
    setEvents((current) => current.filter((event) => event.id !== id));
    if (editingId === id) {
      setDraft(null);
      setEditingId(null);
    }
  }

  function handleSlotClick(day: number, minute: number) {
    if (!selectionStart) {
      setDraft(null);
      setEditingId(null);
      setSelectionStart({ day, minute });
      setIsSelectingSlot(true);
      return;
    }

    const isSameDayEnd = day === selectionStart.day && minute > selectionStart.minute;
    const isNextDayEnd = day === selectionStart.day + 1;

    if (!isSameDayEnd && !isNextDayEnd) {
      setDraft(null);
      setEditingId(null);
      setSelectionStart({ day, minute });
      setIsSelectingSlot(true);
      return;
    }

    const nextDraft = defaultDraft(selectionStart.day, selectionStart.minute, minute);
    nextDraft.endDay = day;
    setDraft(nextDraft);
    setEditingId(null);
    setIsSelectingSlot(false);
    setFormError("");
  }

  function cancelCreate() {
    setDraft(null);
    setEditingId(null);
    setSelectionStart(null);
    setIsSelectingSlot(false);
    setFormError("");
  }

  function submitEvent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!draft || !draft.title.trim()) {
      return;
    }

    const cleanDraft = {
      ...draft,
      title: draft.title.trim(),
      description: draft.description.trim(),
    };

    if (absoluteEnd(cleanDraft) <= absoluteStart(cleanDraft)) {
      setFormError("End time must be after the start time.");
      return;
    }

    const conflict = events.find(
      (item) =>
        item.id !== editingId &&
        absoluteStart(cleanDraft) < absoluteEnd(item) &&
        absoluteEnd(cleanDraft) > absoluteStart(item),
    );

    if (conflict) {
      setFormError(`This overlaps with “${conflict.title}”. Choose another time.`);
      return;
    }

    setEvents((current) => {
      if (editingId) {
        return current.map((item) => (item.id === editingId ? cleanDraft : item));
      }

      return [...current, cleanDraft];
    });
    setDraft(null);
    setEditingId(null);
    setSelectionStart(null);
    setIsSelectingSlot(false);
    setFormError("");
  }

  return (
    <main className="shell">
      <section className="toolbar" aria-label="Schedule controls">
        <div>
          <p className="eyebrow">Weekly Schedule</p>
          <h1>{viewMode === "week" ? formatWeekRange(weekStart) : formatMonth(monthAnchor)}</h1>
        </div>

        <div className="actions">
          <div className="viewSwitch" aria-label="Calendar view">
            <button type="button" className={viewMode === "week" ? "active" : ""} onClick={() => setViewMode("week")}>Week</button>
            <button type="button" className={viewMode === "month" ? "active" : ""} onClick={() => setViewMode("month")}>Month</button>
          </div>
          <button type="button" className="iconButton" onClick={() => movePeriod(-1)} aria-label={`Previous ${viewMode}`}>
            <ChevronLeft size={18} />
          </button>
          <button type="button" className="todayButton" onClick={goToToday}>
            <CalendarDays size={16} />
            Today
          </button>
          <button type="button" className="iconButton" onClick={() => movePeriod(1)} aria-label={`Next ${viewMode}`}>
            <ChevronRight size={18} />
          </button>
          <button type="button" className={isSelectingSlot ? "primaryButton active" : "primaryButton"} onClick={beginCreate}>
            <Plus size={17} />
            {isSelectingSlot ? "Restart Pick" : "New Shift"}
          </button>
          <button type="button" className="iconButton" onClick={() => window.print()} aria-label="Print schedule">
            <Printer size={18} />
          </button>
        </div>
      </section>

      {viewMode === "month" ? (
        <section className="monthWorkspace">
          <div className="scheduleCard monthCard" aria-label="Monthly schedule">
            <div className="scheduleTitle">{formatMonth(monthAnchor)}</div>
            <div className="monthGrid">
              {days.map((day) => <div className="monthDayHeader" key={day}>{day}</div>)}
              {monthDates.map((date) => {
                const dateKey = toDateKey(date);
                const items = monthEvents.flatMap(({ event, weekStart: storedWeekStart }) => {
                  const startDate = addDays(storedWeekStart, event.day);
                  const endDate = addDays(storedWeekStart, event.endDay);
                  const results = [];
                  if (toDateKey(startDate) === dateKey) {
                    results.push({ event, continuation: false });
                  }
                  if (event.endDay !== event.day && toDateKey(endDate) === dateKey) {
                    results.push({ event, continuation: true });
                  }
                  return results;
                });
                const isCurrentMonth = date.getMonth() === monthAnchor.getMonth();
                const isToday = toDateKey(date) === toDateKey(new Date());

                return (
                  <button
                    type="button"
                    className={["monthCell", isCurrentMonth ? "" : "outsideMonth", isToday ? "today" : ""].filter(Boolean).join(" ")}
                    key={dateKey}
                    onClick={() => openDate(date)}
                    aria-label={`Open week of ${date.toLocaleDateString()}`}
                  >
                    <span className="monthDate">{date.getDate()}</span>
                    <div className="monthItems">
                      {items.slice(0, 3).map(({ event, continuation }, index) => (
                        <span className="monthEvent" style={{ borderLeftColor: event.color }} key={`${event.id}-${index}`}>
                          <strong>{event.title}</strong>
                          <small>{continuation ? "Until " : ""}{formatTime(continuation ? event.endMinute : event.startMinute)}</small>
                        </span>
                      ))}
                      {items.length > 3 ? <small className="moreEvents">+{items.length - 3} more</small> : null}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </section>
      ) : (
      <section className="workspace">
        <div className="scheduleCard weeklyCard" aria-label="Weekly schedule preview">
          <div className="scheduleTitle">Weekly Schedule</div>
          <div className="calendarGrid">
            <div className="cornerCell" />
            {days.map((day, index) => (
              <div className="dayHeader" key={day}>
                <span>{day}</span>
                <small>{formatDateLabel(weekDates[index])}</small>
              </div>
            ))}

            {Array.from({ length: endHour - startHour }, (_, rowIndex) => {
              const hour = startHour + rowIndex;
              return (
                <div className="timeCell" style={{ gridRow: `${rowIndex * 2 + 2} / span 2` }} key={hour}>
                  {formatHour(hour * 60)}
                </div>
              );
            })}

            {days.map((day, dayIndex) =>
              Array.from({ length: (endHour - startHour) * 2 }, (_, slotIndex) => {
                const slotMinute = startHour * 60 + slotIndex * 30;
                const isStart =
                  selectionStart?.day === dayIndex &&
                  selectionStart.minute === slotMinute;
                const isSelectableEnd =
                  selectionStart &&
                  ((selectionStart.day === dayIndex && slotMinute > selectionStart.minute) ||
                    selectionStart.day + 1 === dayIndex);

                return (
                <button
                  type="button"
                  className={[
                    "gridCell",
                    "selectable",
                    isStart ? "selectedStart" : "",
                    isSelectableEnd ? "selectableEnd" : "",
                    slotIndex % 2 === 0 ? "halfHour" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  key={`${day}-${slotIndex}`}
                  onClick={() => handleSlotClick(dayIndex, slotMinute)}
                  style={{
                    gridColumn: dayIndex + 2,
                    gridRow: slotIndex + 2,
                  }}
                  aria-label={`${selectionStart ? "Select end time" : "Select start time"} on ${day} at ${formatTime(slotMinute)}`}
                />
              )}),
            )}

            {draft && !editingId ? (
              eventSegments(draft).map((segment, index) => (
                <div
                  className="selectionPreview range"
                  key={`draft-${segment.day}`}
                  style={{
                    left: `calc(var(--time-column) + ((100% - var(--time-column)) / 7 * ${segment.day}))`,
                    top: `calc(var(--header-height) + ${(segment.startMinute / 60)} * var(--hour-height))`,
                    height: `max(18px, ${((segment.endMinute - segment.startMinute) / 60)} * var(--hour-height))`,
                  }}
                >
                  <strong>{index ? `${draft.title || "New Shift"} (cont.)` : draft.title || "New Shift"}</strong>
                  <span>{formatTime(draft.startMinute)} - {formatTime(draft.endMinute)}</span>
                  {draft.description ? <p>{draft.description}</p> : null}
                </div>
              ))
            ) : selectionStart ? (
              <div
                className="selectionPreview"
                style={{
                  left: `calc(var(--time-column) + ((100% - var(--time-column)) / 7 * ${selectionStart.day}))`,
                  top: `calc(var(--header-height) + ${((selectionStart.minute - startHour * 60) / 60)} * var(--hour-height))`,
                }}
              >
                <strong>Start</strong>
                <span>{formatTime(selectionStart.minute)}</span>
              </div>
            ) : null}

            {sortedEvents.flatMap((event) =>
              eventSegments(event).map((segment, segmentIndex) => {
                const top = segment.startMinute / 60;
                const height = (segment.endMinute - segment.startMinute) / 60;
                return (
                <button
                  type="button"
                  className="eventBlock"
                  key={`${event.id}-${segment.day}`}
                  onClick={() => beginEdit(event)}
                  style={{
                    backgroundColor: event.color,
                    left: `calc(var(--time-column) + ((100% - var(--time-column)) / 7 * ${segment.day}))`,
                    top: `calc(var(--header-height) + ${top} * var(--hour-height))`,
                    height: `max(18px, ${height} * var(--hour-height))`,
                  }}
                >
                  <strong>{segmentIndex ? `${event.title} (cont.)` : event.title}</strong>
                  <span>
                    {formatTime(event.startMinute)} - {formatTime(event.endMinute)}
                  </span>
                  {event.description ? <p>{event.description}</p> : null}
                </button>
                );
              }),
            )}
          </div>
        </div>

        <aside className="sidePanel" aria-label="Event editor">
          {draft ? (
            <form onSubmit={submitEvent} className="eventForm">
              <div className="panelHeader">
                <div>
                  <p className="eyebrow">{editingId ? "Edit shift" : "New shift"}</p>
                  <h2>{editingId ? "Update Schedule Item" : "Create Schedule Item"}</h2>
                </div>
              </div>

              <label>
                Title
                <input
                  value={draft.title}
                  onChange={(event) => setDraft({ ...draft, title: event.target.value })}
                  placeholder="Client, location, or task"
                  autoFocus
                />
              </label>

              <label>
                Day
                <select
                  value={draft.day}
                  onChange={(event) => {
                    const day = Number(event.target.value);
                    setDraft({ ...draft, day, endDay: day });
                  }}
                >
                  {days.map((day, index) => (
                    <option key={day} value={index}>
                      {day} {formatDateLabel(weekDates[index])}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                End day
                <select
                  value={draft.endDay}
                  onChange={(event) => setDraft({ ...draft, endDay: Number(event.target.value) })}
                >
                  <option value={draft.day}>{days[draft.day]} {formatDateLabel(weekDates[draft.day])}</option>
                  <option value={draft.day + 1}>
                    {days[(draft.day + 1) % 7]} {formatDateLabel(addDays(weekStart, draft.day + 1))} (next day)
                  </option>
                </select>
              </label>

              <div className="timeFields">
                <label>
                  Start
                  <input
                    type="time"
                    min="00:00"
                    max="23:30"
                    step="1800"
                    value={timeValue(draft.startMinute)}
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        startMinute: parseTime(event.target.value),
                      })
                    }
                  />
                </label>
                <label>
                  End
                  <input
                    type="time"
                    min="00:30"
                    max="23:59"
                    step="1800"
                    value={timeValue(draft.endMinute)}
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        endMinute: parseTime(event.target.value),
                      })
                    }
                  />
                </label>
              </div>

              <label>
                Description
                <textarea
                  value={draft.description}
                  onChange={(event) => setDraft({ ...draft, description: event.target.value })}
                  placeholder="Notes, duties, address, or reminders"
                  rows={4}
                />
              </label>

              <fieldset>
                <legend>Color</legend>
                <div className="swatches">
                  {colorOptions.map((color) => (
                    <button
                      type="button"
                      className={draft.color === color ? "swatch active" : "swatch"}
                      key={color}
                      onClick={() => setDraft({ ...draft, color })}
                      style={{ backgroundColor: color }}
                      aria-label={`Use color ${color}`}
                    />
                  ))}
                </div>
              </fieldset>

              {formError ? <p className="formError" role="alert">{formError}</p> : null}

              <div className="formActions">
                <button type="button" className="secondaryButton" onClick={cancelCreate}>
                  Cancel
                </button>
                <button type="submit" className="primaryButton">
                  {editingId ? "Save Changes" : "Add Shift"}
                </button>
              </div>
            </form>
          ) : (
            <div className="emptyPanel">
              <Clock size={26} />
              <h2>{selectionStart ? "Pick the end time" : "Build this week"}</h2>
              <p>
                {selectionStart
                  ? `Start set for ${days[selectionStart.day]} at ${formatTime(selectionStart.minute)}. Click a later time box on the same day.`
                  : "Select an item on the calendar to edit it, or add a shift for the selected week."}
              </p>
              <button type="button" className="primaryButton" onClick={beginCreate}>
                <Plus size={17} />
                {selectionStart ? "Restart Pick" : "New Shift"}
              </button>
              {selectionStart ? (
                <button type="button" className="secondaryButton" onClick={cancelCreate}>
                  Cancel
                </button>
              ) : null}
            </div>
          )}

          <div className="eventList">
            <div className="panelHeader">
              <div>
                <p className="eyebrow">Items</p>
                <h2>{events.length} scheduled</h2>
              </div>
            </div>

            {sortedEvents.length ? (
              sortedEvents.map((event) => (
                <div className="eventRow" key={event.id}>
                  <span className="rowColor" style={{ backgroundColor: event.color }} />
                  <div>
                    <strong>{event.title}</strong>
                    <small>
                      {days[event.day]} {formatTime(event.startMinute)} - {days[event.endDay % 7]} {formatTime(event.endMinute)}
                    </small>
                  </div>
                  <button type="button" onClick={() => beginEdit(event)} aria-label={`Edit ${event.title}`}>
                    <Edit3 size={15} />
                  </button>
                  <button type="button" onClick={() => deleteEvent(event.id)} aria-label={`Delete ${event.title}`}>
                    <Trash2 size={15} />
                  </button>
                </div>
              ))
            ) : (
              <p className="emptyText">No schedule items for this week yet.</p>
            )}
          </div>
        </aside>
      </section>
      )}
    </main>
  );
}
