window.onload = function () {
  const socket = io('/');
  const documentId = new URL(window.location.href).pathname.split('/')[1] || 'test';
  let name = '';
  let user = '';
  let videoId = '';

  // Elements
  const handle = document.getElementById('handle');
  const register = document.getElementById('register');
  const registerPage = document.getElementById('registerPage');
  const editor = document.getElementById('editor');
  const textarea = document.getElementById('textarea');
  const messages = document.querySelector('.messages');
  const send = document.getElementById('send');
  const text = document.querySelector("#chat_message");
  const videoGrid = document.getElementById("video-grid");
  const myVideo = document.createElement("video");
  myVideo.muted = true;

  // CodeMirror setup
  const Codeeditor = CodeMirror.fromTextArea(textarea, {
    styleActiveLine: true,
    lineNumbers: true,
    matchBrackets: true,
    theme: 'cobalt',
    mode: "text/x-csrc",
  });

  let syncValue = [];
  let keypressed = false;
  const minLines = 14;
  let startingValue = '\n'.repeat(minLines);
  Codeeditor.setValue(startingValue);

  function addEditor(writer) {
    const ul = document.getElementById("editors");
    const li = document.createElement("li");
    li.appendChild(document.createTextNode(writer.name));
    li.className = "list-group-item";
    li.id = writer.id;
    ul.appendChild(li);
  }

  function removeElement(id) {
    const elem = document.getElementById(id);
    if (elem) elem.parentNode.removeChild(elem);
  }

  function applyLocalChanges() {
    if (keypressed) {
      let currentData = Codeeditor.getValue();
      let input = Array.from(syncValue);
      let output = Array.from(currentData);
      let changes = getChanges(input, output);
      applyChanges(input, changes);
      if (output.join('') === input.join('')) {
        socket.emit('content_change', {
          documentId,
          changes
        });
        syncValue = input;
      }
      keypressed = false;
    }
  }

  function setSocketEvents() {
    socket.on('content_change', (incomingChanges) => {
      let input = Array.from(syncValue);
      applyChanges(input, incomingChanges);
      syncValue = input;
      applyLocalChanges();
      Codeeditor.setValue(syncValue.join(''))
    });

    socket.on('register', (data) => {
      addEditor(data);
      videoId = data.id;
    });

    socket.on('user_left', (data) => removeElement(data.id));

    socket.on('members', (members) => {
      members.forEach(addEditor);
      socket.off('members');
    });
  }

  function registerUserListener() {
    handle.style.display = 'none';
    register.style.display = 'none';
    registerPage.style.display = 'none';

    const editorBlock = document.getElementById('editor-block');
    editorBlock.style.display = 'flex';
    syncValue = "";
    name = handle.value;
    user = handle.value;
    socket.emit('register', {
      handle: handle.value,
      documentId
    });
    setSocketEvents();

    socket.on("createMessage", (message, userName) => {
      messages.innerHTML += `<div class="message">
                                <b><i class="far fa-user-circle"></i> 
                                <span>${userName === user ? "me" : userName}</span></b>
                                <span>${message}</span>
                              </div>`;
    });
  }

  function getChanges(input, output) {
    return diffToChanges(diff(input, output), output);
  }

  function applyChanges(input, changes) {
    changes.forEach(change => {
      if (change.type === 'insert') {
        input.splice(change.index, 0, ...change.values);
      } else if (change.type === 'delete') {
        input.splice(change.index, change.howMany);
      }
    });
  }

  let timeout;
  editor.addEventListener('keypress', () => {
    clearTimeout(timeout);
    keypressed = true;
    timeout = setTimeout(applyLocalChanges, 1000);
  });

  register.addEventListener('click', registerUserListener);

  // Video chat functionality
  let peer = new Peer(undefined, {
    path: "/peerjs",
    host: "/",
    port: "443",
  });

  let myVideoStream;
  navigator.mediaDevices
    .getUserMedia({
      audio: true,
      video: true,
    })
    .then((stream) => {
      myVideoStream = stream;
      addVideoStream(myVideo, stream);

      socket.on("user-connected", (userId) => {
        connectToNewUser(userId, stream);
      });

      peer.on("open", (id) => {
        socket.emit("join-room", documentId, id, user);
      });

      socket.on("user-connected", (userId) => connectToNewUser(userId, stream));
    });

  function connectToNewUser(userId, stream) {
    const call = peer.call(userId, stream);
    const video = document.createElement("video");
    video.id = userId;
    call.on("stream", (userVideoStream) => {
      addVideoStream(video, userVideoStream);
    });
  }

  function addVideoStream(video, stream) {
    video.srcObject = stream;
    video.addEventListener("loadedmetadata", () => {
      video.play();
      videoGrid.append(video);
    });
  }

  // Chat functionality
  send.addEventListener("click", () => {
    if (text.value.length > 0) {
      socket.emit("message", {
        message: text.value,
        id: documentId,
        name
      });
      text.value = "";
    }
  });

  text.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && text.value.length > 0) {
      socket.emit("message", {
        message: text.value,
        id: documentId,
        name
      });
      text.value = "";
    }
  });

  // Video controls
  const muteButton = document.querySelector("#muteButton");
  const stopVideo = document.querySelector("#stopVideo");
  const inviteButton = document.querySelector("#inviteButton");

  muteButton.addEventListener("click", () => {
    const enabled = myVideoStream.getAudioTracks()[0].enabled;
    myVideoStream.getAudioTracks()[0].enabled = !enabled;
    muteButton.classList.toggle("background__red");
    muteButton.innerHTML = enabled ? `<i class="fas fa-microphone-slash"></i>` : `<i class="fas fa-microphone"></i>`;
  });

  stopVideo.addEventListener("click", () => {
    const enabled = myVideoStream.getVideoTracks()[0].enabled;
    myVideoStream.getVideoTracks()[0].enabled = !enabled;
    stopVideo.classList.toggle("background__red");
    stopVideo.innerHTML = enabled ? `<i class="fas fa-video-slash"></i>` : `<i class="fas fa-video"></i>`;
  });

  inviteButton.addEventListener("click", () => {
    prompt("Copy this link and send it to people you want to meet with", window.location.href);
  });

};
