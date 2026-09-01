// Calendar script: renders a week view with hourly slots and allows adding/removing tasks per cell.

const calendarHeader = document.getElementById('calendar-header');
const timeColumn = document.getElementById('time-column');
const daysGrid = document.getElementById('days-grid');
const weekStartSelect = document.getElementById('week-start');
const clearBtn = document.getElementById('clear-btn');
const editModal = document.getElementById('edit-modal');
const editNameInput = document.getElementById('edit-name');
const editStartTimeInput = document.getElementById('edit-start-time');
const editEndTimeInput = document.getElementById('edit-end-time');
const editColorInput = document.getElementById('edit-color');
const editSaveBtn = document.getElementById('edit-save-btn');
const editCancelBtn = document.getElementById('edit-cancel-btn');
const modalClose = document.querySelector('.modal-close');

let currentDate = new Date();
let editingTask = null; // { key, idx }

const HOURS_START = 9; // 9 AM
const HOURS_END = HOURS_START + 24 - 6; // 24-hour range: 6 AM -> next day 6 AM

// Drag state
let dragState = {
  isDragging: false,
  startDay: null,
  startHour: null,
  currentDay: null,
  currentHour: null,
  preview: null
};

// Event listeners
if (weekStartSelect) weekStartSelect.addEventListener('change', () => renderCalendar());
if (clearBtn) clearBtn.addEventListener('click', () => clearAllTasks());
if (modalClose) modalClose.addEventListener('click', () => closeEditModal());
if (editCancelBtn) editCancelBtn.addEventListener('click', () => closeEditModal());
if (editSaveBtn) editSaveBtn.addEventListener('click', () => saveEditedTask());

document.addEventListener('DOMContentLoaded', () => {
  document.body.className = 'darker';
  renderCalendar();
});

// Local storage helpers
function loadTasks() {
  const data = localStorage.getItem('calendarTasks');
  if (!data) return {};
  const tasks = JSON.parse(data);
  // Migrate old string format to new object format if needed
  const migratedTasks = {};
  for (const key in tasks) {
    if (Array.isArray(tasks[key])) {
      migratedTasks[key] = tasks[key].map(t => 
        typeof t === 'string' ? migrateTaskString(t) : t
      );
    }
  }
  return migratedTasks;
}

function migrateTaskString(taskStr) {
  // Convert old format "Task Name (9:00 AM - 11:00 AM)" to new format
  const match = taskStr.match(/^(.*?)\s*\((\d{1,2}):(\d{2})\s(AM|PM)\s-\s(\d{1,2}):(\d{2})\s(AM|PM)\)$/);
  if (!match) {
    return { name: taskStr, startTime: '09:00', endTime: '10:00', color: '#FF6B6B' };
  }
  
  const name = match[1];
  const startHour = parseInt(match[2]);
  const startMin = parseInt(match[3]);
  const startAmpm = match[4];
  const endHour = parseInt(match[5]);
  const endMin = parseInt(match[6]);
  const endAmpm = match[7];
  
  const start24 = formatHourTo24(startHour, startAmpm);
  const end24 = formatHourTo24(endHour, endAmpm);
  
  return {
    name: name,
    startTime: `${String(start24).padStart(2, '0')}:${String(startMin).padStart(2, '0')}`,
    endTime: `${String(end24).padStart(2, '0')}:${String(endMin).padStart(2, '0')}`,
    color: '#FF6B6B'
  };
}

function formatHourTo24(hour, ampm) {
  let h = parseInt(hour);
  if (ampm === 'PM' && h !== 12) h += 12;
  if (ampm === 'AM' && h === 12) h = 0;
  return h;
}

function saveTasks(tasks) {
  localStorage.setItem('calendarTasks', JSON.stringify(tasks));
}

function timeToMinutes(timeStr) {
  const [h, m] = timeStr.split(':').map(Number);
  return h * 60 + m;
}

function minutesToTime(mins) {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function formatTimeDisplay(timeStr) {
  const [h, m] = timeStr.split(':').map(Number);
  const hour = h % 12 === 0 ? 12 : h % 12;
  const ampm = h < 12 ? 'AM' : 'PM';
  return `${hour}:${String(m).padStart(2, '0')} ${ampm}`;
}

function startOfWeek(date, weekStart) {
  const d = new Date(date);
  const day = (d.getDay() + 7 - weekStart) % 7;
  d.setDate(d.getDate() - day);
  d.setHours(0,0,0,0);
  return d;
}

function formatDateShort(d) {
  return `${d.getMonth()+1}/${d.getDate()}`;
}

function weekdayName(idx) {
  return ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][idx % 7];
}

function clearChildren(el) { while (el.firstChild) el.removeChild(el.firstChild); }

function renderCalendar() {
  clearChildren(calendarHeader);
  clearChildren(timeColumn);
  clearChildren(daysGrid);

  const weekStart = parseInt(weekStartSelect ? weekStartSelect.value : '0', 10);
  const start = startOfWeek(currentDate, weekStart);

  // header: empty cell then 7 day headers
  const empty = document.createElement('div');
  empty.className = 'empty';
  calendarHeader.appendChild(empty);

  const days = [];
  for (let i=0;i<7;i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    days.push(d);
    const dayEl = document.createElement('div');
    dayEl.className = 'day';
    dayEl.innerHTML = `<div>${weekdayName(d.getDay())}</div><div style="font-size:0.8rem;opacity:0.8">${formatDateShort(d)}</div>`;
    calendarHeader.appendChild(dayEl);
  }

  // time column (hours)
  for (let h = HOURS_START; h <= HOURS_END; h++) {
    const timeSlot = document.createElement('div');
    timeSlot.className = 'time-slot';
    const hour24 = ((h % 24) + 24) % 24;
    const hour = (hour24 % 12) === 0 ? 12 : hour24 % 12;
    const ampm = hour24 < 12 ? 'AM' : 'PM';
    timeSlot.textContent = `${hour}:00 ${ampm}`;
    timeColumn.appendChild(timeSlot);
  }

  // days grid: create 7 columns each with cells per hour
  const tasks = loadTasks();

  for (let dayIndex = 0; dayIndex < 7; dayIndex++) {
    const col = document.createElement('div');
    col.className = 'day-column';

    for (let h = HOURS_START; h <= HOURS_END; h++) {
      const cell = document.createElement('div');
      cell.className = 'cell';
      cell.dataset.day = dayIndex;
      cell.dataset.hour = h;

      const key = cellKey(days[dayIndex], h);
      if (tasks[key]) {
        tasks[key].forEach((t, idx) => {
          const timeRange = parseTaskTimeRange(t);
          // Calculate duration, handling midnight crossings
          let duration = 0;
          if (timeRange) {
            if (timeRange.end > timeRange.start) {
              duration = timeRange.end - timeRange.start;
            } else {
              // Spans past midnight: 24 - start + end
              duration = 24 - timeRange.start + timeRange.end;
            }
          }
          const isMultiHour = duration > 1;
          
          // Convert h to 0-23 format for comparison with timeRange.start
          const h24 = ((h % 24) + 24) % 24;
          
          // Only render multi-hour tasks in their start hour
          if (isMultiHour && timeRange && h24 !== timeRange.start) {
            return; // Skip rendering in continuation cells
          }
          
          const taskEl = makeTaskElement(t, key, idx, h, isMultiHour);
          if (taskEl) {
            cell.appendChild(taskEl);
            
            // For multi-hour tasks, calculate and set height
            if (isMultiHour) {
              const cellHeight = 60; // pixels
              const totalHeight = cellHeight * duration;
              taskEl.style.height = totalHeight + 'px';
            }
          }
        });
      }

      // Drag listeners
      cell.addEventListener('mousedown', (ev) => startDrag(ev, dayIndex, h, days));
      cell.addEventListener('mouseover', (ev) => dragOver(ev, dayIndex, h));
      cell.addEventListener('mouseup', (ev) => endDrag(ev, days));

      col.appendChild(cell);
    }

    daysGrid.appendChild(col);
  }
}

function startDrag(ev, dayIndex, hour, days) {
  // Only drag on empty area, not on tasks
  if (ev.target.classList.contains('task') || ev.target.classList.contains('remove')) return;
  
  dragState.isDragging = true;
  dragState.startDay = dayIndex;
  dragState.startHour = hour;
  dragState.currentDay = dayIndex;
  dragState.currentHour = hour;
  
  // Clear any existing preview
  if (dragState.preview) dragState.preview.remove();
  
  ev.preventDefault();
}

function dragOver(ev, dayIndex, hour) {
  if (!dragState.isDragging) return;
  
  // Only allow dragging within same day
  if (dayIndex !== dragState.startDay) {
    dragState.currentDay = dragState.startDay;
    dragState.currentHour = hour;
    return;
  }
  
  dragState.currentDay = dayIndex;
  dragState.currentHour = hour;
  
  updateDragPreview();
}

function endDrag(ev, days) {
  if (!dragState.isDragging) return;
  
  dragState.isDragging = false;
  
  const minHour = Math.min(dragState.startHour, dragState.currentHour);
  const maxHour = Math.max(dragState.startHour, dragState.currentHour);
  const dayIndex = dragState.startDay;
  
  if (dragState.preview) {
    dragState.preview.remove();
    dragState.preview = null;
  }
  
  // Only create task if dragging across at least 1 hour
  if (minHour === maxHour) {
    dragState.startDay = null;
    dragState.startHour = null;
    dragState.currentDay = null;
    dragState.currentHour = null;
    return;
  }
  
  const text = prompt('Enter task name:');
  if (!text || !text.trim()) {
    dragState.startDay = null;
    dragState.startHour = null;
    dragState.currentDay = null;
    dragState.currentHour = null;
    return;
  }
  
  // Create task spanning multiple hours
  const tasksObj = loadTasks();
  const day = days[dayIndex];
  
  // Convert hours to minutes, preserving exact hour:00 times
  const startTimeStr = `${String(minHour).padStart(2, '0')}:00`;
  const endTimeStr = `${String((maxHour + 1) % 24).padStart(2, '0')}:00`;
  
  const taskObj = {
    name: text.trim(),
    startTime: startTimeStr,
    endTime: endTimeStr,
    color: '#FF6B6B'
  };
  
  // Store task at all hours it spans
  const startDate24 = minHour % 24;
  const endDate24 = (maxHour + 1) % 24;
  
  for (let h = minHour; h <= maxHour; h++) {
    const key = cellKey(day, h);
    tasksObj[key] = tasksObj[key] || [];
    tasksObj[key].push(taskObj);
  }
  saveTasks(tasksObj);
  
  dragState.startDay = null;
  dragState.startHour = null;
  dragState.currentDay = null;
  dragState.currentHour = null;
  
  renderCalendar();
}

function updateDragPreview() {
  if (!dragState.isDragging) return;
  
  const minHour = Math.min(dragState.startHour, dragState.currentHour);
  const maxHour = Math.max(dragState.startHour, dragState.currentHour);
  
  // Remove old preview
  if (dragState.preview) dragState.preview.remove();
  
  // Create new preview
  dragState.preview = document.createElement('div');
  dragState.preview.style.cssText = `
    position: fixed;
    pointer-events: none;
    background: rgba(100, 150, 200, 0.3);
    border: 2px dashed rgba(100, 150, 200, 0.8);
    border-radius: 4px;
    z-index: 999;
  `;
  
  // Calculate preview position and size
  const cells = Array.from(daysGrid.querySelectorAll('.cell'));
  const cellsInRange = cells.filter(c => 
    parseInt(c.dataset.day) === dragState.startDay &&
    parseInt(c.dataset.hour) >= minHour &&
    parseInt(c.dataset.hour) <= maxHour
  );
  
  if (cellsInRange.length > 0) {
    const firstCell = cellsInRange[0];
    const lastCell = cellsInRange[cellsInRange.length - 1];
    const firstRect = firstCell.getBoundingClientRect();
    const lastRect = lastCell.getBoundingClientRect();
    
    dragState.preview.style.left = firstRect.left + 'px';
    dragState.preview.style.top = firstRect.top + 'px';
    dragState.preview.style.width = firstRect.width + 'px';
    dragState.preview.style.height = (lastRect.bottom - firstRect.top) + 'px';
    
    document.body.appendChild(dragState.preview);
  }
}

function cellKey(dateObj, hour) {
  // Map hour to the correct date and normalized 0-23 hour.
  const d = new Date(dateObj);
  const addDays = Math.floor(hour / 24);
  const hour24 = ((hour % 24) + 24) % 24;
  if (addDays) d.setDate(d.getDate() + addDays);
  d.setHours(0,0,0,0);
  return `${d.toISOString().slice(0,10)}_${hour24}`;
}

function parseTaskTimeRange(task) {
  // Parse task object to extract start and end times in 24-hour format
  if (typeof task === 'string') {
    task = migrateTaskString(task);
  }
  
  const [startH, startM] = task.startTime.split(':').map(Number);
  const [endH, endM] = task.endTime.split(':').map(Number);
  
  return { start: startH, end: endH };
}

function makeTaskElement(task, key, idx, hour, isMultiHour) {
  const el = document.createElement('div');
  el.className = 'task';
  el.style.backgroundColor = task.color || '#FF6B6B';
  
  if (isMultiHour) {
    el.style.position = 'absolute';
    el.style.width = 'calc(100% - 12px)';
    el.style.left = '6px';
    el.style.top = '6px';
    el.style.boxSizing = 'border-box';
  }
  
  const taskText = `${task.name} (${formatTimeDisplay(task.startTime)} - ${formatTimeDisplay(task.endTime)})`;
  const span = document.createElement('span');
  span.textContent = taskText;
  
  const rem = document.createElement('span');
  rem.className = 'remove';
  rem.textContent = '✕';
  rem.title = 'Remove task';
  rem.addEventListener('click', (ev) => {
    ev.stopPropagation();
    const tasksObj = loadTasks();
    if (!tasksObj[key]) return;
    tasksObj[key].splice(idx, 1);
    if (tasksObj[key].length === 0) delete tasksObj[key];
    saveTasks(tasksObj);
    el.remove();
    renderCalendar();
  });
  
  // Add click to edit
  el.addEventListener('click', (ev) => {
    if (!ev.target.classList.contains('remove')) {
      openEditModal(task, key, idx);
    }
  });
  el.style.cursor = 'pointer';
  
  el.appendChild(span);
  el.appendChild(rem);
  return el;
}

function openEditModal(task, key, idx) {
  editingTask = { key, idx };
  editNameInput.value = task.name;
  editStartTimeInput.value = task.startTime;
  editEndTimeInput.value = task.endTime;
  editColorInput.value = task.color || '#FF6B6B';
  editModal.style.display = 'flex';
}

function closeEditModal() {
  editModal.style.display = 'none';
  editingTask = null;
}

function saveEditedTask() {
  if (!editingTask) return;
  
  const tasksObj = loadTasks();
  const { key, idx } = editingTask;
  
  if (!tasksObj[key] || !tasksObj[key][idx]) {
    closeEditModal();
    return;
  }
  
  const newStartTime = editStartTimeInput.value;
  const newEndTime = editEndTimeInput.value;
  
  if (!newStartTime || !newEndTime) {
    alert('Please fill in all fields');
    return;
  }
  
  const oldTask = tasksObj[key][idx];
  const updatedTask = {
    name: editNameInput.value,
    startTime: newStartTime,
    endTime: newEndTime,
    color: editColorInput.value
  };
  
  // If time changed, we need to reorganize task storage
  const [oldStartH] = oldTask.startTime.split(':').map(Number);
  const [newStartH] = newStartTime.split(':').map(Number);
  
  if (oldStartH !== newStartH) {
    // Remove from all old keys and re-add to new keys
    for (const taskKey in tasksObj) {
      tasksObj[taskKey] = tasksObj[taskKey].filter((t, i) => !(taskKey === key && i === idx));
      if (tasksObj[taskKey].length === 0) delete tasksObj[taskKey];
    }
    
    // Add to new time slots
    const [startH, startM] = newStartTime.split(':').map(Number);
    const [endH, endM] = newEndTime.split(':').map(Number);
    
    // This is simplified - assumes same day for now
    for (let h = startH; h < endH; h++) {
      const baseKey = key.split('_')[0]; // Get date part
      const newKey = `${baseKey}_${h}`;
      tasksObj[newKey] = tasksObj[newKey] || [];
      tasksObj[newKey].push(updatedTask);
    }
  } else {
    tasksObj[key][idx] = updatedTask;
  }
  
  saveTasks(tasksObj);
  closeEditModal();
  renderCalendar();
}

// Clear all tasks
function clearAllTasks() {
  if (confirm('Are you sure you want to clear all tasks?')) {
    localStorage.removeItem('calendarTasks');
    renderCalendar();
  }
}
