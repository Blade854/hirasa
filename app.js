const { useState, useEffect } = React;

function App() {
  const [activeTab, setActiveTab] = useState("settings");
  const [schoolData, setSchoolData] = useState({
    name: "",
    address: "",
    examPeriod: "",
  });

  const [examsData, setExamsData] = useState({
    examDays: [],
    periods: [],
    subjects: {}, // key: period => value: array of subjects
    rooms: [], // array of room objects {id, name}
    teachers: [], // array of teacher objects {name, subject}
  });

  const [distributionMode, setDistributionMode] = useState("manual"); // manual or auto
  const [autoRules, setAutoRules] = useState({
    requiredPerRoom: 1,
    excludeSubjectTeacher: true,
    fairDistribution: true,
    restDays: 0,
    maxGuardPeriods: "all",
  });

  const [roomAssignments, setRoomAssignments] = useState([]);
  const [coordinators, setCoordinators] = useState({}); // key: subject => value: teacherName

  const [teacherGuardStats, setTeacherGuardStats] = useState({});

  // Load data from localStorage on startup
  useEffect(() => {
    const savedData = localStorage.getItem("examGuardData");
    if (savedData) {
      const parsedData = JSON.parse(savedData);
      setSchoolData(parsedData.schoolData || schoolData);
      setExamsData(parsedData.examsData || examsData);
      setRoomAssignments(parsedData.roomAssignments || []);
      setCoordinators(parsedData.coordinators || {});
      setAutoRules(parsedData.autoRules || autoRules);
    }
  }, []);

  // Save data to localStorage
  const saveToLocal = () => {
    localStorage.setItem(
      "examGuardData",
      JSON.stringify({
        schoolData,
        examsData,
        roomAssignments,
        coordinators,
        autoRules,
      })
    );
    alert("تم حفظ البيانات النظام بنجاح!");
  };

  // Restore data from localStorage
  const loadFromLocal = () => {
    const savedData = localStorage.getItem("examGuardData");
    if (savedData) {
      const parsedData = JSON.parse(savedData);
      setSchoolData(parsedData.schoolData || schoolData);
      setExamsData(parsedData.examsData || examsData);
      setRoomAssignments(parsedData.roomAssignments || []);
      setCoordinators(parsedData.coordinators || {});
      setAutoRules(parsedData.autoRules || autoRules);
      alert("تم استرجاع البيانات من التخزين المحلي");
    } else {
      alert("لا توجد بيانات محفوظة");
    }
  };

  // Initialize assignments when rooms or teachers change
  useEffect(() => {
    if (examsData.rooms.length > 0 && examsData.teachers.length > 0) {
      const initialAssignments = examsData.rooms.map((room) => ({
        roomId: room.id,
        roomName: room.name,
        day: "",
        period: "",
        assignedTeachers: [],
      }));
      setRoomAssignments(initialAssignments);
    }

    // Update stats for each teacher
    const stats = {};
    examsData.teachers.forEach((t) => {
      stats[t.name] = 0;
    });

    roomAssignments.forEach((room) => {
      room.assignedTeachers.forEach((teacher) => {
        if (!stats[teacher]) stats[teacher] = 0;
        stats[teacher]++;
      });
    });

    setTeacherGuardStats(stats);
  }, [examsData.rooms, examsData.teachers, roomAssignments]);

  // --- SETTINGS TAB FUNCTIONS ---
  const handleAddExamDay = () => {
    const newDay = prompt("أدخل يوم الامتحان:");
    if (newDay) {
      setExamsData((prev) => ({
        ...prev,
        examDays: [...prev.examDays, newDay],
      }));
    }
  };

  const handleAddPeriod = () => {
    const newPeriod = prompt("أدخل اسم الفترة (صباحية/مسائية...):");
    if (newPeriod) {
      setExamsData((prev) => ({
        ...prev,
        periods: [...prev.periods, newPeriod],
        subjects: {
          ...prev.subjects,
          [newPeriod]: prev.subjects[newPeriod] || [],
        },
      }));
    }
  };

  const handleAddSubject = (period) => {
    const subjectName = prompt(`أدخل اسم المادة لفترة ${period}:`);
    if (subjectName) {
      setExamsData((prev) => ({
        ...prev,
        subjects: {
          ...prev.subjects,
          [period]: [...(prev.subjects[period] || []), subjectName.toLowerCase()],
        },
      }));
    }
  };

  const handleAddRoom = () => {
    const roomName = prompt("أدخل اسم أو رقم الحجرة:");
    if (roomName) {
      setExamsData((prev) => ({
        ...prev,
        rooms: [
          ...prev.rooms,
          { id: prev.rooms.length + 1, name: roomName },
        ],
      }));
    }
  };

  const handleAddTeacher = () => {
    const teacherName = prompt("أدخل اسم الأستاذ:");
    const teacherSubject = prompt("اختر تخصص الأستاذ:", "").toLowerCase();

    if (teacherName && teacherSubject) {
      setExamsData((prev) => ({
        ...prev,
        teachers: [
          ...prev.teachers,
          { name: teacherName, subject: teacherSubject },
        ],
      }));
    }
  };

  const handleSetCoordinator = (subject) => {
    const teacherNames = examsData.teachers.map((t) => t.name).join(", ");
    const coordName = prompt(
      `من فضلك أدخل اسم الأستاذ المنسق لمادة "${subject}":\n(الأساتذة المتاحون: ${teacherNames})`
    );

    if (coordName && examsData.teachers.some((t) => t.name === coordName)) {
      setCoordinators((prev) => ({
        ...prev,
        [subject]: coordName,
      }));
    } else {
      alert("اسم الأستاذ غير صحيح أو غير موجود");
    }
  };

  // --- DISTRIBUTION LOGIC ---
  const handleDistributeAutomatically = () => {
    if (examsData.teachers.length === 0 || examsData.rooms.length === 0) {
      alert("يرجى إدخال الأساتذة والحجرات أولاً");
      return;
    }

    const updatedAssignments = [...roomAssignments];

    const teacherGuardCount = {};
    const lastGuardDate = {};

    examsData.teachers.forEach((teacher) => {
      teacherGuardCount[teacher.name] = 0;
      lastGuardDate[teacher.name] = -Infinity;
    });

    let teacherIndex = 0;

    updatedAssignments.forEach((room) => {
      room.assignedTeachers = [];

      for (let i = 0; i < autoRules.requiredPerRoom; i++) {
        let attempts = 0;
        let teacherFound = false;

        while (!teacherFound && attempts < examsData.teachers.length * 2) {
          const currentTeacher = examsData.teachers[teacherIndex % examsData.teachers.length];

          const isCoordinator =
            autoRules.excludeSubjectTeacher &&
            Object.entries(coordinators).some(
              ([subject, name]) =>
                name === currentTeacher.name &&
                room.period &&
                examsData.subjects[room.period]?.includes(subject)
            );

          const exceedsMaxPeriods =
            autoRules.maxGuardPeriods !== "all" &&
            teacherGuardCount[currentTeacher.name] >=
              (autoRules.maxGuardPeriods === "one_period" ? 1 : examsData.examDays.length);

          const tooSoonForRest =
            autoRules.restDays > 0 &&
            Math.abs(lastGuardDate[currentTeacher.name] - examsData.examDays.indexOf(room.day)) <=
              autoRules.restDays;

          if (!isCoordinator && !exceedsMaxPeriods && !tooSoonForRest) {
            room.assignedTeachers.push(currentTeacher.name);
            teacherGuardCount[currentTeacher.name]++;
            lastGuardDate[currentTeacher.name] = examsData.examDays.indexOf(room.day);
            teacherFound = true;
          }

          teacherIndex++;
          attempts++;
        }

        if (!teacherFound) {
          room.assignedTeachers.push("لم يتم العثور على أستاذ متاح");
        }
      }
    });

    setRoomAssignments(updatedAssignments);
  };

  const handleManualAssignment = (roomId, selectedTeachers) => {
    const updated = roomAssignments.map((r) =>
      r.roomId === roomId ? { ...r, assignedTeachers: selectedTeachers } : r
    );
    setRoomAssignments(updated);
  };

  const printReport = () => {
    const content = document.getElementById("printable-report").innerHTML;
    const w = window.open("", "", "height=600,width=800");
    w.document.write("<html><head><title>كشف حراسة</title>");
    w.document.write("</head><body>");
    w.document.write(content);
    w.document.write("</body></html>");
    w.document.close();
    w.print();
  };

  return (
    <div>
      <header>
        <h1>نظام إدارة حراسة الامتحانات</h1>
        <p>توزيع حراسة الأساتذة على الحجرات</p>
      </header>

      <nav>
        <button onClick={() => setActiveTab("settings")}>إعداد البيانات</button>
        <button onClick={() => setActiveTab("distribution")}>توزيع الحراس</button>
        <button onClick={saveToLocal}>حفظ البيانات</button>
        <button onClick={loadFromLocal}>استرجاع البيانات</button>
      </nav>

      <main>
        {/* Settings Tab */}
        {activeTab === "settings" && (
          <div style={{ padding: "20px", backgroundColor: "#fff", borderRadius: "8px" }}>
            <h2>معلومات المدرسة</h2>
            <input
              placeholder="اسم المدرسة"
              value={schoolData.name}
              onChange={(e) =>
                setSchoolData((prev) => ({ ...prev, name: e.target.value }))
              }
            />
            <input
              placeholder="عنوان المدرسة"
              value={schoolData.address}
              onChange={(e) =>
                setSchoolData((prev) => ({ ...prev, address: e.target.value }))
              }
            />
            <input
              placeholder="فترة الامتحان"
              value={schoolData.examPeriod}
              onChange={(e) =>
                setSchoolData((prev) => ({ ...prev, examPeriod: e.target.value }))
              }
            />

            <h3>أيام الامتحان</h3>
            <ul>
              {examsData.examDays.map((day, i) => (
                <li key={i}>{day}</li>
              ))}
            </ul>
            <button onClick={handleAddExamDay}>+ إضافة يوم</button>

            <h3>الفترات</h3>
            <ul>
              {examsData.periods.map((p, i) => (
                <li key={i}>{p}</li>
              ))}
            </ul>
            <button onClick={handleAddPeriod}>+ إضافة فترة</button>

            <h3>مواد الامتحان</h3>
            {examsData.periods.map((period) => (
              <div key={period}>
                <h4>{period}</h4>
                <ul>
                  {(examsData.subjects[period] || []).map((s, i) => (
                    <li key={i}>{s}</li>
                  ))}
                </ul>
                <button onClick={() => handleAddSubject(period)}>+ إضافة مادة</button>
                <button onClick={() => handleSetCoordinator(period)}>تعيين المنسق</button>
              </div>
            ))}

            <h3>الأساتذة</h3>
            <button onClick={handleAddTeacher}>+ إضافة أستاذ</button>
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>الاسم</th>
                  <th>التخصص</th>
                </tr>
              </thead>
              <tbody>
                {examsData.teachers.map((t, i) => (
                  <tr key={i}>
                    <td>{i + 1}</td>
                    <td>{t.name}</td>
                    <td>{t.subject}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <h3>الحجرات</h3>
            <ul>
              {examsData.rooms.map((r, i) => (
                <li key={i}>{r.name}</li>
              ))}
            </ul>
            <button onClick={handleAddRoom}>+ إضافة حجرة</button>
          </div>
        )}

        {/* Distribution Tab */}
        {activeTab === "distribution" && (
          <div style={{ padding: "20px", backgroundColor: "#fff", borderRadius: "8px" }}>
            <h2>قواعد التوزيع التلقائي</h2>
            <label>
              عدد الحراس لكل حجرة:
              <input
                type="number"
                min="1"
                value={autoRules.requiredPerRoom}
                onChange={(e) =>
                  setAutoRules({ ...autoRules, requiredPerRoom: parseInt(e.target.value) || 1 })
                }
              />
            </label>
            <br />
            <label>
              <input
                type="checkbox"
                checked={autoRules.excludeSubjectTeacher}
                onChange={(e) =>
                  setAutoRules({ ...autoRules, excludeSubjectTeacher: e.target.checked })
                }
              />
              لا يعين الأستاذ لحراسة مادة تخصصه
            </label>
            <br />
            <label>
              <input
                type="checkbox"
                checked={autoRules.fairDistribution}
                onChange={(e) =>
                  setAutoRules({ ...autoRules, fairDistribution: e.target.checked })
                }
              />
              توزيع عادل
            </label>
            <br />
            <label>
              أيام الراحة لكل أستاذ:
              <input
                type="number"
                min="0"
                value={autoRules.restDays}
                onChange={(e) =>
                  setAutoRules({ ...autoRules, restDays: parseInt(e.target.value) || 0 })
                }
              />
            </label>
            <br />
            <label>
              الحد الأقصى لفترات الحراسة:
              <select
                value={autoRules.maxGuardPeriods}
                onChange={(e) =>
                  setAutoRules({ ...autoRules, maxGuardPeriods: e.target.value })
                }
              >
                <option value="all">جميع الفترات</option>
                <option value="one_day">يوم واحد فقط</option>
                <option value="one_period">فترة واحدة فقط</option>
              </select>
            </label>
            <br />
            <button onClick={handleDistributeAutomatically}>توزيع تلقائي</button>

            <div style={{ marginTop: "20px" }}>
              <button onClick={() => setDistributionMode("manual")}>توزيع يدوي</button>
              <button onClick={() => setDistributionMode("auto")}>توزيع تلقائي</button>
            </div>

            {distributionMode === "manual" && (
              <div style={{ overflowX: "auto", marginTop: "10px" }}>
                <table>
                  <thead>
                    <tr>
                      <th>الحجرة</th>
                      <th>اليوم</th>
                      <th>الفترة</th>
                      <th>الحراس</th>
                    </tr>
                  </thead>
                  <tbody>
                    {roomAssignments.map((room, index) => (
                      <tr key={index}>
                        <td>{room.roomName}</td>
                        <td>
                          <select
                            value={room.day}
                            onChange={(e) => {
                              const updated = [...roomAssignments];
                              updated[index].day = e.target.value;
                              setRoomAssignments(updated);
                            }}
                          >
                            <option value="">اختر يوم</option>
                            {examsData.examDays.map((day, idx) => (
                              <option key={idx} value={day}>
                                {day}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td>
                          <select
                            value={room.period}
                            onChange={(e) => {
                              const updated = [...roomAssignments];
                              updated[index].period = e.target.value;
                              setRoomAssignments(updated);
                            }}
                          >
                            <option value="">اختر فترة</option>
                            {examsData.periods.map((period, idx) => (
                              <option key={idx} value={period}>
                                {period}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td>
                          <select
                            multiple
                            value={roomAssignments[index].assignedTeachers}
                            onChange={(e) => {
                              const selected = Array.from(e.target.selectedOptions).map(
                                (opt) => opt.value
                              );
                              handleManualAssignment(room.roomId, selected);
                            }}
                          >
                            {examsData.teachers.map((t, idx) => (
                              <option key={idx} value={t.name}>
                                {t.name}
                              </option>
                            ))}
                          </select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {distributionMode === "auto" && (
              <div style={{ overflowX: "auto", marginTop: "20px" }}>
                <table>
                  <thead>
                    <tr>
                      <th>الحجرة</th>
                      <th>أسماء الحراس</th>
                    </tr>
                  </thead>
                  <tbody>
                    {roomAssignments.map((room, i) => (
                      <tr key={i}>
                        <td>{room.roomName}</td>
                        <td>{room.assignedTeachers.join(", ") || "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div style={{ marginTop: "20px" }}>
              <h3>إحصائيات الحراسة</h3>
              <table>
                <thead>
                  <tr>
                    <th>الاسم</th>
                    <th>عدد الفترات التي حرَّس فيها</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(teacherGuardStats).map(([name, count], i) => (
                    <tr key={i}>
                      <td>{name}</td>
                      <td>{count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <button onClick={printReport}>طباعة كشف التوزيع</button>
          </div>
        )}
      </main>

      <footer>
        &copy; {new Date().getFullYear()} - برمجة المستشار قدري بلال | جميع الحقوق محفوظة
      </footer>

      <div id="printable-report" style={{ display: "none" }}>
        <h3>كشف توزيع حراسة الامتحانات</h3>
        <p>مدرسة: {schoolData.name}</p>
        <p>فترة الامتحان: {schoolData.examPeriod}</p>
        <table style={{ border: "1px solid black", width: "100%" }}>
          <thead>
            <tr>
              <th style={{ border: "1px solid black", padding: "10px" }}>الحجرة</th>
              <th style={{ border: "1px solid black", padding: "10px" }}>أسماء الحراس</th>
            </tr>
          </thead>
          <tbody>
            {roomAssignments.map((room, i) => (
              <tr key={i}>
                <td style={{ border: "1px solid black", padding: "10px" }}>{room.roomName}</td>
                <td style={{ border: "1px solid black", padding: "10px" }}>
                  {room.assignedTeachers.join(", ") || "-"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// رسم التطبيق
const container = document.getElementById("root");
ReactDOM.createRoot(container).render(<App />);
